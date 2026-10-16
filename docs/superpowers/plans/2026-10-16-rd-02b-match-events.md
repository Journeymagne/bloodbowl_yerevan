# Этап 02b · Записи матча — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** записи действий в матче (`match_events`): миграция `014`, чистый модуль `src/domain/post-match/events.mjs` (записи → статистика, разница обратно, карьера), итоги матча, которые берут статистику и травмы из записей, шаг «Игроки», который дописывает разницу, и `finishPost`, который ставит записям `settled_at` в транзакции `applyPostMatchRoster`.

**Architecture:** одна аддитивная миграция (`014_match_events.sql`, только DDL). Правила — чистые функции в `src/domain/post-match/events.mjs`; итоги (`state.mjs`) получают записи через `source.events` и следуют за ними, пока сторона не сохранила шаг «Игроки». Сервер читает записи матча под теми же блокировками, что итоги (пара `FOR UPDATE`, обе команды `FOR UPDATE`, строка `match_post_games` `FOR UPDATE`), пишет разницу и ставит `settled_at` в той же транзакции (`server/season/match-events-store.mjs`). SQL проверяется на одноразовых базах `gata_test_*`, затем репетицией на засеянном дампе схемы 008, и только потом применяется к dev-базе.

**Tech Stack:** Node.js (ES-модули, `node --test`), `pg`, PostgreSQL 16 в Docker (`gata-league-postgres`, `127.0.0.1:5437`).

**Spec:** `docs/superpowers/specs/2026-10-14-redesign-design.md` (спека 3.0) §3.7 — главный источник; §0 п. 9 и п. 11, §3.6. План 3.0: `docs/superpowers/plans/2026-10-14-redesign.md`, этап 2, пункт 2.6. Мастер-план: `docs/superpowers/plans/2026-10-14-redesign-rollout.md` — Global Constraints, протокол этапа, строка 02b (smoke: все четыре), «Дополнения к этапам → 09b» (итоги из 2.x завершаются в 3.0). Спека выката `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md` §3.3 (пять открытых состояний), §5.1 (новые таблицы начинаются пустыми). План 02a (`git show 1252ae2:docs/superpowers/plans/2026-10-16-rd-02a-data.md`) — «Порядок миграций 014 и 015». Правила работы: `docs/redesign/handoff-0.9.1/README.md`, `PR-CHECKLIST.md`, корневой `CLAUDE.md`.

## Global Constraints

- Ветка `rd/02b-match-events`, worktree `/Users/felstell/git/bb-rd-02b`, база — `origin/redesign` `dbb6e24`. PR в `redesign` — по протоколу мастер-плана (шаги 7–10), вливает Claude после проверок и ревью; в рамках этого плана не пушить.
- Только миграция, `src/domain`, сервер итогов, `scripts/smoke-post-match.mjs`, тесты и документация; без UI и без HTTP-эндпоинтов записей (этап 03).
- `014` — только DDL: `CREATE TABLE` и два `CREATE INDEX`. Никаких `DELETE`, `DROP`, `UPDATE`, никакого чтения существующих таблиц и никакого заполнения задним числом (спека 3.0 §3.7, спека выката §5.1). `rehearsal:check` уже требует пустую `match_events` сразу после миграций (`START_EMPTY` в `scripts/rehearsal/snapshot.mjs`) — это остаётся так.
- Порядок проверки миграции: рецепт Т (одноразовые базы) → рецепт Р (засеянный дамп схемы 008) → рецепт М (dev-база). До рецепта М файл `014` можно править сколько угодно. Применённый к dev-базе файл не правится (`server/db/migrate.mjs` сверяет checksum); дефект после М исправляется только новой миграцией — это стоп-условие.
- `014` не читает `team_fallen_players`, `015` не читает `match_events`; обе последовательности (`014 → 015` как на проде, `015 → 014` как на dev-базе) дают одну схему и одни данные — это закрепляет тест Task 1. Имена миграций в тестах — точные (`migrateThrough` и `runMigration` бросают на неизвестном имени).
- SQL по JSON-данным: любое приведение типа — под `CASE` (Postgres не обещает порядок операндов `AND`), `jsonb_array_elements` — только после проверки `jsonb_typeof`. В этом этапе SQL по JSON нет; кто добавит — по этому правилу.
- Roster-блоб не переписывается (§0.8): итоги меняют его только в `finishPost`, как сейчас. Миграция блоб не читает и не трогает.
- Статистика — целые 0…99 (`postCount`), `delta` — ровно `+1` или `−1`; разница в `n` пишется `|n|` строками по `±1`. После шага «Игроки» и после завершения `statisticsFromEvents(записи)` совпадает со статистикой итогов по всем счётчикам записей и по травме — без допусков.
- Записи пишутся и учитываются только внутри транзакции итогов, после её проверок (`POST_REVISION`, `POST_TEAM_CHANGED`, стадия и статус итогов). Отказ или устаревший запрос не оставляет ни строки разницы, ни `settled_at` (`ROLLBACK`). Повтор или двойная отправка не пишут записи дважды и не учитывают их дважды.
- `src/domain/**` чистый: без DOM, storage, сети и глобалов (`npm run check`).
- `npm run check` (`scripts/check-references.mjs`) читает ключ объекта `xy:` как использование имени без последней буквы (`to:` — как экспорт `t`). Объекты с таким ключом в `src/`, `server/`, `scripts/` строятся через помощника или с другим именем ключа.
- Каждый новый код ошибки API — в `API_ERRORS` (`server/http/errors.mjs`) и `error.<CODE>` в `src/i18n/en.json` и `ru.json` (`test/api-errors.test.mjs`). Этот этап новых кодов не добавляет: `MATCH_NOT_LIVE` бросает эндпоинт этапа 03.
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 строк на функцию, 0 недостижимых функций; бюджеты только уменьшаются.
- Правила и числа — из `content/Gata/**` и `src/domain/**` (§0.1, §0.12). Без новых зависимостей, фреймворков и сборщика.
- Комментарии в коде — по-английски, в тоне соседних файлов. Проза планов и ответы владельцу — по-русски.
- Одна задача — один коммит с тестами. Сообщение коммита заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (второй `-m` в командах ниже).
- `npm run build` — до `npm test`: тесты и `matchReference()` читают `public/data.*.json`.
- Базы — только локальные: dev-база `gata_league` (только `npm run db:migrate`), `gata_rehearsal`, одноразовые `gata_test_*`, `gata_seed_02b`, `gata_smoke_02b`. Данные засеваются только в `gata_seed_02b`, `gata_smoke_02b`, `gata_test_*`. В репозиторий — ничего из дампов; служебное — в `output/02b/` (он в `.gitignore`).
- **Стоп-условия** (спека выката §2.3): контент и код расходятся в правиле; нужно продуктовое решение вне спек; миграцию `014` нужно изменить после рецепта М. В любом случае — остановиться и спросить контроллера, молча ни одну сторону не выбирать.

## Review Focus

1. **Итоги, начатые в 2.x, завершаются в 3.0** (в состоянии нет `followsEvents`, записей нет, статистика уже введена) → без `POST_TEAM_CHANGED`; SPP после = SPP до + статистика матча, один раз; завершение само пишет записи из статистики и ставит им `settled_at` (Task 5).
2. **Тапы после того, как тренер открыл «Итоги»** → пока сторона не сохранила шаг «Игроки», её статистика подхватывает их; шаг, отправленный по устаревшей ревизии, получает `POST_REVISION`, а не стирает тап разницей молча (Task 3, Task 5).
3. **Двойной тап и отмены** (+1 и −1, лишний −1, травма поставлена, сменена, снята) → статистика ровно по смыслу тапов и не меньше нуля; разница возвращает записи к сохранённому, повторная разница пуста (Task 2).
4. **Шаг «Игроки» отправлен дважды, или два тренера завершают одновременно** → разница записана один раз, `settled_at` поставлен один раз, SPP не удвоились (Task 5).
5. **Брошенный матч, закрытый технически** — админ подтвердил техническую победу до итогов, а TD уже натаплены → шаг «Игроки» требует нулей (`POST_STATISTICS`), сохранённые нули дают разницу −1, записи учитываются при завершении (Task 3).

## Решения этого плана (контроллер подтверждает)

- `match_events.pairing_id … ON DELETE CASCADE`, а не `SET NULL`: `NULL` должен значить только «правка вне матча». При `SET NULL` неучтённые записи пары, которую удалил админ, стали бы ожидающими правками вне матча — их посчитала бы карьера и перенёс бы в блоб `finishPost` этапа 03. Удалённая пара и так уносит `match_post_games` и `match_post_applications` (007). Спека §3.7 правится в Task 1.
- `crowdCasualties` и `foulCasualties` — не счётчики записей (их нет в `CHECK` спеки): `statisticsFromEvents` даёт 0, разница их не трогает, их вводят на шаге «Игроки».
- Травма из записей — последняя неотменённая: `+1` ставит травму `{code, stat?}`, `−1` снимает последнюю такую же, `−1` без пары ничего не делает. `retire` в записях нет (`false`). Коды — `INJURIES` без `none`; `lasting` — только с `stat` из `PLAYER_STATS`; запись с другим кодом не читается.
- Счётчик из записей обрезается до 0…99 (границы `postCount`), а разница считается от сырых сумм, поэтому лишний −1 компенсируется, а не прячется.
- Итоги следуют за записями, пока сторона не сохранила шаг «Игроки»: `createPostSide` ставит `followsEvents: true` и берёт статистику из `source.events`, действие `statistics` ставит `false`, сервер применяет `followEvents` до и после каждого действия. Изменение поднимает ревизию итогов: устаревшее действие получает `POST_REVISION`. Стороны из 2.x (флага нет) за записями не следуют — их статистика не обнуляется.
- Разница пишется в двух местах: после действия `statistics` (шаг «Игроки», §3.7) и ещё раз в `finishPost` перед `settled_at` — так учтённые записи всегда равны применённой статистике, в том числе у итогов из 2.x и при тапах после шага «Игроки».
- `finishPost` учитывает только записи своего матча (`pairing_id` = матч, `saved_team_id` = команда стороны). **Правка вне матча (§3.7) — этап 03 целиком:** её путь во время матча существует только через `POST /api/teams/:id/events` без `pairingId` (этап 03), а `PATCH`-половина и перенос в блоб в `finishPost` — две стороны одного правила; пункт 2.6 плана 3.0 её не называет, а «Вне этапа» плана 02a отдаёт эндпоинты записей этапу 03.
- `MATCH_NOT_LIVE` — этап 03: в 02b записи пишут только итоги под своими проверками, кода нигде не бросается, поэтому и в словари он не добавляется.
- Строка записи — один `INSERT` с `created_at = clock_timestamp()`, как у `team_ledger`: строки одной транзакции сохраняют порядок для истории.
- «Счёт из записей» — интерфейс 09b складывает статистику итогов (она уже из записей); сервер не меняется и по-прежнему требует совпадения на шаге «Игроки» (`POST_STATISTICS`).
- Брошенный матч: записи остаются неучтёнными, `careerCounters` считает их «ждёт итогов». Закрыть его можно существующим путём (админ вносит результат до начала итогов → итоги открываются с официальным результатом и подставляют записи). Отдельного действия админа «учесть или удалить записи» в плане 3.0 нет — предложение: этап 12 (заметка в мастер-плане, Task 6).
- Дамп для рецепта Р — схема 008, как прод до переезда: репетиция применяет 009…015 в порядке имён (014 раньше 015); обратный порядок проверяют dev-база и тест Task 1.
- Чекбокс 2.6 в плане 3.0 и строка 02b в таблице мастер-плана отмечаются после слияния (протокол, шаг 10), не в этой ветке.

## Порядок миграций 014 и 015

Как записано в плане 02a: раннер применяет все отсутствующие файлы в порядке имён, «последней применённой» отметки нет. Dev-база и любые базы с `015` получат `014` следующим `db:migrate`; прод в день X применит 009…015 одним запуском, `014` раньше `015`. Это безопасно, пока `014` не читает `team_fallen_players`, а `015` не читает `match_events`. `014` — чистый DDL новой таблицы, `015` читает только таблицы 007 и 011. Тест Task 1 применяет обе последовательности к одинаково засеянным базам и сравнивает схему и данные.

## Вне этапа

Эндпоинты `GET/POST /api/teams/:id/events`, `GET /api/teams/:id/players/:pid/history`, код `MATCH_NOT_LIVE` и записи матча в `scripts/smoke-api.mjs` — этап 03. Правка вне матча целиком (`PATCH /api/teams/:id` пишет учтённые записи; во время матча — записи без пары и без `settled_at`; `finishPost` переносит их в блоб) — этап 03 (см. «Решения»). Счётчики в составе во время игры — 09a; шаг «Счёт» с суммами из записей и расхождением — 09b; карьера с «ждёт итогов» — 07e; `rehearsal:transitions` — 09b (02b проверяет тот же переход тестом на сервере, Task 5). Действие админа над записями брошенного матча — не запланировано (предложение: 12). Задним числом таблица не заполняется.

## Рецепты проверки

Задачи ссылаются на них по букве. Все команды — из `/Users/felstell/git/bb-rd-02b`. Каждый вызов Bash — новая оболочка, поэтому переменные берутся из `output/02b/env.sh` (Task 0).

**Т — тесты на настоящем Postgres.** `. output/02b/env.sh && node --test <файлы>` или `. output/02b/env.sh && npm test`. Без `env.sh` эти тесты пропускаются (`# skipped`).

**Р — репетиция на засеянном дампе схемы 008** (дамп собирается в Task 0):

```bash
npm run rehearsal:restore -- output/02b/seed-008.dump
npm run rehearsal:check -- --before
npm run rehearsal:migrate
npm run rehearsal:check -- --after; echo "exit $?"
sed -n '1,70p' output/rehearsal/report.md
```

Expected: `rehearsal:check: OK — no existing data changed (output/rehearsal/report.md)`, `exit 0`. В отчёте:

```
- new table match_events: 0 rows
## Stages
- Seed Finished Away — active — has a played match
- Seed Finished Home — active — has a played match
- Seed Live Away — active — entered in the current season
- Seed Live Home — active — entered in the current season
- Seed Post Away — draft — no entry, no match
- Seed Post Home — draft — no entry, no match
## Fallen players carried over
- Seed Finished Home: 1
## Open states
- started, post-match not finished: 00000000-0000-4000-8000-000000000042 (league), 00000000-0000-4000-8000-000000000043 (friendly)
```

Строка `Migrations:` перечисляет миграции 009+ с диска в порядке имён. До Task 1 их шесть и строки `new table match_events` нет; с Task 1 — семь, `014_match_events.sql` перед `015_backfill_fallen_players.sql`.

**М — миграция на dev-базе** (`gata_league` из `.env`):

```bash
npm run db:migrate && npm run db:migrate -- --check
```

Expected: `applied 014_match_events.sql`, затем `database is up to date`.

**С — smoke на отдельной базе `gata_smoke_02b`:**

```bash
. output/02b/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_02b 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/02b/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3012 node server/server.mjs`; дождаться `curl -fsS http://localhost:3012/api/health` (Monitor с until-циклом). Smoke-команды задачи:

```bash
APP_URL=http://localhost:3012 npm run smoke
. output/02b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3012 npm run smoke:pre-match
. output/02b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3012 npm run smoke:friendly
. output/02b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3012 npm run smoke:post-match
```

Expected: каждый скрипт печатает свою строку `… passed …`. После — остановить фоновый сервер. После правок кода сервер перезапускается.

---

### Task 0: Worktree, окружение и засеянный дамп 2.x

- [ ] **Step 1: База и зелёный старт**

```bash
cd /Users/felstell/git/bb-rd-02b
git status --short && git log --oneline -1
test "$(git merge-base HEAD origin/redesign)" = "$(git rev-parse origin/redesign)" && echo "base ok"
npm run build && npm test 2>&1 | tail -6
docker exec gata-league-postgres pg_isready -U gata_admin
docker exec gata-league-postgres psql -U gata_admin -d gata_league -Atc "SELECT name FROM schema_migrations WHERE name >= '009' ORDER BY name"
```

Expected: чистое дерево, верхний коммит — этот план, `base ok`, `# pass 964`, `# skipped 21`, `accepting connections`; у dev-базы 009–013 и 015, без 014. Иначе — стоп, вопрос контроллеру.

- [ ] **Step 2: `output/02b/env.sh`**

```bash
mkdir -p output/02b
BASE="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$BASE" in postgres://*@localhost:5437/gata_league) ;; *) echo "unexpected DATABASE_URL"; exit 1 ;; esac
cat > output/02b/env.sh <<EOF
export GATA_TEST_DATABASE_URL='$BASE'
export SEED_URL='${BASE%/gata_league}/gata_seed_02b'
export SMOKE_URL='${BASE%/gata_league}/gata_smoke_02b'
EOF
. output/02b/env.sh && echo "$SEED_URL $SMOKE_URL" | sed -E 's#//[^@]*@#//***@#g'
. output/02b/env.sh && npm test 2>&1 | tail -6
```

Expected: `postgres://***@localhost:5437/gata_seed_02b postgres://***@localhost:5437/gata_smoke_02b`; с `env.sh` — `# fail 0`, `# skipped 0`. `env.sh` не экспортирует `DATABASE_URL`: репетиция и `db:migrate` читают его из `.env`.

- [ ] **Step 3: `output/02b/seed.sql`** (не коммитится) — три состояния, важные для 02b: матч сыгран через итоги (с погибшим, для `015`), лиговый матч идёт (снимки есть, итогов нет), итоги товарищеского заполнены до шага «Игроки» и не завершены. JSON состояний минимален: миграции и репетиция их не разбирают.

```sql
BEGIN;
INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES
  ('00000000-0000-4000-8000-000000000001', 'seed-a', 'seed-a', '@seed_a', 'x'),
  ('00000000-0000-4000-8000-000000000002', 'seed-b', 'seed-b', '@seed_b', 'x'),
  ('00000000-0000-4000-8000-000000000003', 'seed-c', 'seed-c', '@seed_c', 'x');
INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Seed Finished Home', 'teams/human',
   '{"treasury": 62.5, "players": [{"id": "s-ok", "rowIndex": 0, "name": "Ok", "spp": {"touchdowns": 1}}]}'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'Seed Finished Away', 'teams/dwarf',
   '{"treasury": 90, "players": [{"id": "s-away", "rowIndex": 0, "name": "Away"}]}'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'Seed Live Home', 'teams/human',
   '{"treasury": 40, "players": [{"id": "s-live", "rowIndex": 0, "name": "Live", "spp": {"touchdowns": 2}}]}'),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000003', 'Seed Live Away', 'teams/human',
   '{"treasury": 40, "players": [{"id": "s-visitor", "rowIndex": 0, "name": "Visitor"}]}'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000002', 'Seed Post Home', 'teams/dwarf',
   '{"treasury": 20, "players": [{"id": "s-post", "rowIndex": 0, "name": "Drafted"}]}'),
  ('00000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000003', 'Seed Post Away', 'teams/human',
   '{"treasury": 20, "players": [{"id": "s-guest", "rowIndex": 0, "name": "Guest"}]}');
INSERT INTO seasons (id, name, status, current_round) VALUES ('00000000-0000-4000-8000-000000000021', 'Seed Season', 'active', 1);
INSERT INTO season_rounds (id, season_id, round_number, status) VALUES
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000021', 1, 'started');
INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013'),
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000014');
INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id, friendly_home_team_id,
  friendly_away_team_id, result_status, home_touchdowns, away_touchdowns, home_casualties, away_casualties, preparation_status) VALUES
  ('00000000-0000-4000-8000-000000000041', 'friendly', 1, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', 'confirmed', 1, 0, 1, 0, 'in_progress'),
  ('00000000-0000-4000-8000-000000000043', 'friendly', 2, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000016', 'pending', NULL, NULL, NULL, NULL, 'in_progress');
INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, preparation_status) VALUES
  ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000051', 1,
   '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000032', 'in_progress');
INSERT INTO match_preparations (pairing_id, state) VALUES
  ('00000000-0000-4000-8000-000000000042', '{"status": "in_progress"}'),
  ('00000000-0000-4000-8000-000000000043', '{"status": "in_progress"}');
INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) VALUES
  ('00000000-0000-4000-8000-000000000042', 'home', '00000000-0000-4000-8000-000000000013', '{"players": [{"id": "s-live"}]}'),
  ('00000000-0000-4000-8000-000000000042', 'away', '00000000-0000-4000-8000-000000000014', '{"players": [{"id": "s-visitor"}]}'),
  ('00000000-0000-4000-8000-000000000043', 'home', '00000000-0000-4000-8000-000000000015',
   '{"players": [{"id": "s-post"}, {"id": "journeyman-8", "kind": "journeyman"}]}'),
  ('00000000-0000-4000-8000-000000000043', 'away', '00000000-0000-4000-8000-000000000016', '{"players": [{"id": "s-guest"}]}');
INSERT INTO match_post_games (pairing_id, state) VALUES
  ('00000000-0000-4000-8000-000000000041', '{"status": "completed",
    "home": {"gamesPlayed": 4, "injuries": {"s-dead": {"code": "dead"}}}, "away": {"gamesPlayed": 4, "injuries": {}}}'),
  ('00000000-0000-4000-8000-000000000043', '{"status": "draft",
    "home": {"stage": 3, "statistics": {"s-post": {"touchdowns": 1}, "journeyman-8": {"catches": 1}}}, "away": {"stage": 2}}');
INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster) VALUES
  ('00000000-0000-4000-8000-000000000041', 'home', '00000000-0000-4000-8000-000000000011',
   '{"treasury": 50, "players": [{"id": "s-dead", "rowIndex": 0, "name": "Fallen"}, {"id": "s-ok", "rowIndex": 0, "name": "Ok"}]}',
   '{"treasury": 62.5, "players": [{"id": "s-ok", "rowIndex": 0, "name": "Ok", "spp": {"touchdowns": 1}}]}'),
  ('00000000-0000-4000-8000-000000000041', 'away', '00000000-0000-4000-8000-000000000012',
   '{"treasury": 90, "players": [{"id": "s-away", "rowIndex": 0, "name": "Away"}]}',
   '{"treasury": 90, "players": [{"id": "s-away", "rowIndex": 0, "name": "Away"}]}');
COMMIT;
```

- [ ] **Step 4: Дамп схемы 008 с этими данными**

```bash
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_seed_02b
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_seed_02b
. output/02b/env.sh && node --input-type=module -e '
import pg from "pg";
import { migrateThrough } from "./test/helpers/scratch-db.mjs";
const client = new pg.Client({ connectionString: process.env.SEED_URL });
await client.connect();
await migrateThrough(client, "008_withdraw_season_entries.sql");
await client.end();'
docker exec -i gata-league-postgres psql -v ON_ERROR_STOP=1 -U gata_admin -d gata_seed_02b < output/02b/seed.sql
docker exec gata-league-postgres pg_dump -Fc -U gata_admin gata_seed_02b > output/02b/seed-008.dump
docker exec gata-league-postgres psql -U gata_admin -d gata_seed_02b -Atc "SELECT max(name) FROM schema_migrations"
```

Expected: `COMMIT`, непустой `output/02b/seed-008.dump`, последняя строка — `008_withdraw_season_entries.sql`.

- [ ] **Step 5: Рецепт Р до 014 (базовая линия)** — Expected: как в рецепте, но шесть миграций и без строки `new table match_events`. Если отчёт отличается не только этим — стоп: инструменты репетиции разошлись с этим планом. Коммита нет.

---

### Task 1: `014_match_events.sql` (п. 2.6, миграция)

**Files:**
- Create: `server/db/migrations/014_match_events.sql`, `test/migration-014-match-events.test.mjs`
- Modify: `docs/superpowers/specs/2026-10-14-redesign-design.md` (§3.7)

**Interfaces:**
- Consumes: `withScratchDatabase`, `runMigration`, `scratchSkip` (`test/helpers/scratch-db.mjs`); дамп Task 0.
- Produces: таблица `match_events` — ровно SQL спеки §3.7, кроме `pairing_id … ON DELETE CASCADE`; индексы `match_events_team_idx (saved_team_id, pairing_id, created_at)` и `match_events_open_idx (saved_team_id) WHERE settled_at IS NULL`.

- [ ] **Step 1: Падающие тесты `test/migration-014-match-events.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = id(1), U2 = id(2), H = id(11), A = id(12), GAME = id(41), OTHER = id(42);

async function twoTeams(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'h', 'h', '@h', 'x'), ($2, 'a', 'a', '@a', 'x')", [U1, U2]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'Home', 'teams/human'), ($2, $4, 'Away', 'teams/human')", [H, A, U1, U2]);
  for (const [pairing, table] of [[GAME, 1], [OTHER, 2]]) {
    await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id, result_status) VALUES ($1, 'friendly', $2, $3, $4, $5, $6, 'confirmed')`,
    [pairing, table, U1, U2, H, A]);
  }
}

/** A friendly finished through the post-match before 3.0, with one death 015 carries over. */
async function finishedFriendly(client) {
  await twoTeams(client);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [GAME,
    { status: "completed", home: { gamesPlayed: 4, injuries: { "h-dead": { code: "dead" } } }, away: { gamesPlayed: 4, injuries: {} } }]);
  const before = { treasury: 50, players: [{ id: "h-dead", rowIndex: 0 }, { id: "h-ok", rowIndex: 0 }] };
  const after = { treasury: 60, players: [{ id: "h-ok", rowIndex: 0 }] };
  await client.query(`INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster)
    VALUES ($1, 'home', $2, $3, $4), ($1, 'away', $5, $6, $6)`, [GAME, H, before, after, A, { treasury: 0, players: [] }]);
}

/** What either order must leave behind: both tables' columns, constraints and indexes, and the rows. */
async function shape(client) {
  const tables = ["match_events", "team_fallen_players"];
  const query = async (sql) => (await client.query(sql, [tables])).rows;
  return {
    columns: await query(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, column_name`),
    constraints: await query(`SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid::regclass::text = ANY($1) ORDER BY 1, 2`),
    indexes: await query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY 1, 2"),
    fallen: (await client.query("SELECT saved_team_id, player->>'id' AS player, from_match, recorded_by FROM team_fallen_players ORDER BY 1, 2")).rows,
    events: (await client.query("SELECT count(*)::int AS n FROM match_events")).rows[0].n,
  };
}

async function migratedInOrder(order) {
  let result;
  await withScratchDatabase(async ({ client }) => {
    await finishedFriendly(client);
    for (const name of order) await runMigration(client, name);
    result = await shape(client);
  }, { through: "013_user_preferences.sql" });
  return result;
}

test("014 then 015 (production) and 015 then 014 (the dev database) leave the same schema and the same rows", { skip: scratchSkip }, async () => {
  const production = await migratedInOrder(["014_match_events.sql", "015_backfill_fallen_players.sql"]);
  const development = await migratedInOrder(["015_backfill_fallen_players.sql", "014_match_events.sql"]);
  assert.deepEqual(development, production);
  assert.equal(production.events, 0, "014 backfills nothing");
  assert.deepEqual(production.fallen, [{ saved_team_id: H, player: "h-dead", from_match: true, recorded_by: null }]);
  assert.ok(production.indexes.some((index) => index.indexname === "match_events_open_idx" && /WHERE \(settled_at IS NULL\)/.test(index.indexdef)));
  assert.ok(production.indexes.some((index) => index.indexname === "match_events_team_idx"));
});

const insert = (client, values) => client.query(
  "INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury) VALUES ($1, $2, $3, $4, $5, $6) RETURNING settled_at, created_at",
  values);

test("a row is +1 or -1 on one of the ten counters, and starts unsettled", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoTeams(client);
    const [row] = (await insert(client, [H, GAME, "journeyman-8", "touchdowns", 1, null])).rows;
    assert.equal(row.settled_at, null);
    assert.ok(row.created_at instanceof Date);
    await insert(client, [H, GAME, "p1", "injury", -1, { code: "lasting", stat: "ag" }]);
    for (const [counter, delta] of [["mvps", 1], ["crowdCasualties", 1], ["touchdowns", 2], ["touchdowns", 0]]) {
      await assert.rejects(insert(client, [H, GAME, "p1", counter, delta, null]), { code: "23514" }, `${counter} ${delta}`);
    }
    await assert.rejects(insert(client, [H, GAME, null, "touchdowns", 1, null]), { code: "23502" });
  }, { through: "014_match_events.sql" });
});

test("a deleted pairing takes its rows, an edit outside a match stays, and a deleted team takes all of its rows", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoTeams(client);
    await insert(client, [H, GAME, "p1", "touchdowns", 1, null]);
    await insert(client, [H, OTHER, "p1", "touchdowns", 1, null]);
    await insert(client, [H, null, "p1", "casualties", 1, null]);
    await insert(client, [A, GAME, "a1", "touchdowns", 1, null]);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [GAME]);
    const left = async () => (await client.query("SELECT saved_team_id, pairing_id, counter FROM match_events ORDER BY counter, pairing_id")).rows;
    assert.deepEqual(await left(), [{ saved_team_id: H, pairing_id: null, counter: "casualties" }, { saved_team_id: H, pairing_id: OTHER, counter: "touchdowns" }]);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [OTHER]);
    await client.query("DELETE FROM saved_teams WHERE id = $1", [H]);
    assert.deepEqual(await left(), []);
  }, { through: "014_match_events.sql" });
});
```

- [ ] **Step 2: Убедиться, что падают** — Run: `. output/02b/env.sh && node --test test/migration-014-match-events.test.mjs` → FAIL `no migration 014_match_events.sql`.

- [ ] **Step 3: `server/db/migrations/014_match_events.sql`**

Шапка-комментарий в стиле 011/015: почему таблица (счётчик в блобе — одно число на игрока; итоги стартуют статистику с нуля и прибавляют её к `player.spp`; `finishPost` отказывает при сдвинутой ревизии — поэтому тап в блоб во время матча даёт двойной счёт или `POST_TEAM_CHANGED`; journeymen и звёзды есть только в снимке); что такое строка (`±1` одного счётчика одного игрока, id из блоба или из снимка; травма — `counter = 'injury'` с `{code, stat?}`); кто читает и пишет (итоги берут статистику и травмы из записей — `src/domain/post-match/events.mjs`, шаг «Игроки» дописывает разницу, `finishPost` ставит `settled_at` в транзакции, которая применяет состав; карьера = блоб + неучтённые); `pairing_id NULL` — правка вне матча (этап 03), удалённая пара уносит свои строки (`CASCADE`, как `match_post_games` и `match_post_applications` в 007) — иначе её неучтённые строки читались бы как ожидающие правки вне матча; задним числом ничего не заполняется (история матчей до 3.0 — `match_post_applications`), `scripts/rehearsal` требует пустую таблицу сразу после миграций; файл только создаёт и не читает ни одной существующей таблицы; `015` идёт после по номеру, но написан раньше, раннер применяет недостающее в порядке имён, и ни один файл не читает того, что пишет другой. Тело — ровно:

```sql
CREATE TABLE match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  pairing_id uuid REFERENCES season_pairings(id) ON DELETE CASCADE,   -- NULL: an edit outside a match
  player_id text NOT NULL,           -- an id from the blob or from the match snapshot (journeyman, star)
  counter text NOT NULL CHECK (counter IN ('touchdowns','casualties','knockouts','completions','catches',
        'interceptions','throws','landings','bonus','injury')),
  delta smallint NOT NULL CHECK (delta IN (-1, 1)),
  injury jsonb,                      -- counter = 'injury': {code, stat?}
  settled_at timestamptz,            -- when the blob took it in; NULL: not yet
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_events_team_idx ON match_events (saved_team_id, pairing_id, created_at);
CREATE INDEX match_events_open_idx ON match_events (saved_team_id) WHERE settled_at IS NULL;
```

- [ ] **Step 4: Рецепт Т** — Run: `. output/02b/env.sh && node --test test/migration-014-match-events.test.mjs` → PASS (3 tests). Run: `. output/02b/env.sh && npm test 2>&1 | tail -6` → `# fail 0`, `# skipped 0` (тесты, которые мигрируют до конца или до `015`, теперь получают и `014`). Правки SQL — только на этом шаге и только до рецепта М.

- [ ] **Step 5: Рецепт Р** — Expected: как в рецепте целиком: `OK`, `exit 0`, `new table match_events: 0 rows`, `Migrations: 7 applied …` с `014_match_events.sql` перед `015_backfill_fallen_players.sql`, открытые состояния `…042 (league), …043 (friendly)` и `- Seed Finished Home: 1` (порядок 014 → 015 на данных). Любая проблема в отчёте — вернуться к шагу 3.

- [ ] **Step 6: Спека §3.7** — в блоке SQL `ON DELETE SET NULL,   -- NULL: правка вне матча` → `ON DELETE CASCADE,   -- NULL: правка вне матча`. После блока, перед первым пунктом, — пункт: `- **Удалённая пара** уносит свои записи (`CASCADE`, как `match_post_games` и `match_post_applications` в 007), поэтому `pairing_id NULL` всегда значит «правка вне матча»: иначе неучтённые записи удалённого матча стали бы ожидающими правками, их посчитала бы карьера и перенёс бы в блоб `finishPost`.`

- [ ] **Step 7: Рецепт М** — Expected: `applied 014_match_events.sql`, `database is up to date`. С этого шага `014` не правится (стоп-условие).

- [ ] **Step 8: Commit**

```bash
git add server/db/migrations/014_match_events.sql test/migration-014-match-events.test.mjs docs/superpowers/specs/2026-10-14-redesign-design.md
git commit -m "feat(db): 014 match events — taps as rows, a deleted pairing takes its own" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `events.mjs` — записи в статистику, разница обратно, карьера (п. 2.6, домен)

**Files:**
- Create: `src/domain/post-match/events.mjs`, `test/match-events.test.mjs`

**Interfaces:**
- Consumes: `normalizeMatchStats` (`statistics.mjs`), `INJURIES` (`rules.mjs`), `normalizeSppCounters` (`roster/players.mjs`), `PLAYER_STATS` (`roster/values.mjs`).
- Produces (`src/domain/post-match/events.mjs`, чистый):
  - `EVENT_COUNTERS = Object.freeze(["touchdowns", "casualties", "knockouts", "completions", "catches", "interceptions", "throws", "landings", "bonus", "injury"])` — порядок `CHECK` в `014`
  - `MatchEvent = { playerId: string, counter: string, delta: 1 | -1, injury?: { code: string, stat?: string } | null, settledAt?: string | Date | null }`
  - `statisticsFromEvents(snapshot: { players: { id: string }[] }, events: MatchEvent[] = []) → { statistics: Record<id, MatchStats>, injuries: Record<id, { code, stat?, retire: false }> }` — строка на каждого игрока снимка, в порядке снимка; счётчики — суммы `delta`, обрезанные до 0…99; `crowdCasualties`, `foulCasualties` — 0; травма — последняя неотменённая; записи игроков вне снимка, неизвестных счётчиков и негодных травм не читаются
  - `eventsDiff({ statistics, injuries }, events: MatchEvent[]) → MatchEvent[]` — первый аргумент — сторона итогов или результат `statisticsFromEvents`; записи `{ playerId, counter, delta }` (у травмы ещё `injury`), игроки в порядке ключей `statistics`, по каждому — счётчики в порядке `EVENT_COUNTERS`, затем травмы; игроков вне `statistics` не трогает
  - `careerCounters(player: { id: string, spp?: object }, events: MatchEvent[] = []) → Record<SPP counter, number>` — `normalizeSppCounters(player.spp)` плюс неучтённые (`!settledAt`) записи этого игрока, кроме `injury`; каждый счётчик не меньше нуля

- [ ] **Step 1: Падающие тесты `test/match-events.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EVENT_COUNTERS, careerCounters, eventsDiff, statisticsFromEvents } from "../src/domain/post-match/events.mjs";
import { POST_STATS } from "../src/domain/post-match/rules.mjs";
import { normalizeMatchStats } from "../src/domain/post-match/statistics.mjs";
import { normalizeSppCounters } from "../src/domain/roster/players.mjs";
import { sppCounterDefinitions } from "../src/domain/league-rules.mjs";

const snapshot = { players: [{ id: "p1" }, { id: "p2" }, { id: "journeyman-8", kind: "journeyman" }, { id: "star-griff", kind: "star" }] };
const tap = (playerId, counter, delta = 1) => ({ playerId, counter, delta, injury: null, settledAt: null });
const hurt = (playerId, code, delta = 1, stat) => ({ ...tap(playerId, "injury", delta), injury: stat ? { code, stat } : { code } });
const stats = (values = {}) => ({ ...normalizeMatchStats(), ...values });
const injuriesOf = (...events) => statisticsFromEvents(snapshot, events).injuries;

test("the counters are the ones 014 allows: the SPP counters without the MVP, plus injury", () => {
  const sql = readFileSync(new URL("../server/db/migrations/014_match_events.sql", import.meta.url), "utf8");
  const allowed = sql.match(/CHECK \(counter IN \(([^)]*)\)\)/)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed, [...EVENT_COUNTERS]);
  const counted = EVENT_COUNTERS.filter((counter) => counter !== "injury");
  assert.deepEqual(counted, sppCounterDefinitions.map(([key]) => key).filter((key) => key !== "mvps"));
  assert.ok(counted.every((counter) => POST_STATS.includes(counter)));
});

test("every snapshot player starts at zero, taps add up, and a tap taken back cancels", () => {
  const { statistics, injuries } = statisticsFromEvents(snapshot,
    [tap("p1", "touchdowns"), tap("p1", "touchdowns"), tap("p1", "touchdowns", -1), tap("p2", "casualties")]);
  assert.deepEqual(Object.keys(statistics), ["p1", "p2", "journeyman-8", "star-griff"]);
  assert.deepEqual(statistics.p1, stats({ touchdowns: 1 }));
  assert.deepEqual(statistics.p2, stats({ casualties: 1 }));
  assert.deepEqual(statistics["journeyman-8"], stats());
  assert.deepEqual(injuries, {});
});

test("a journeyman and a star exist only in the snapshot and are counted; a player outside it is not", () => {
  const { statistics } = statisticsFromEvents(snapshot, [tap("journeyman-8", "touchdowns"), tap("star-griff", "casualties"), tap("ghost", "touchdowns")]);
  assert.equal(statistics["journeyman-8"].touchdowns, 1);
  assert.equal(statistics["star-griff"].casualties, 1);
  assert.equal(Object.hasOwn(statistics, "ghost"), false);
});

test("more taps taken back than given read as zero, and a counter the table does not have is not read", () => {
  const { statistics } = statisticsFromEvents(snapshot, [tap("p1", "touchdowns", -1), tap("p1", "mvps"), tap("p1", "crowdCasualties")]);
  assert.deepEqual(statistics.p1, stats());
});

test("the injury is the latest one still standing: taking one back uncovers the one before", () => {
  assert.deepEqual(injuriesOf(hurt("p1", "miss")), { p1: { code: "miss", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "dead")), { p1: { code: "dead", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "dead"), hurt("p1", "dead", -1)), { p1: { code: "miss", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "dead"), hurt("p1", "miss"), hurt("p1", "dead"), hurt("p1", "dead", -1)), { p1: { code: "miss", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "miss", -1)), {});
  assert.deepEqual(injuriesOf(hurt("p1", "miss", -1)), {});
  assert.deepEqual(injuriesOf(hurt("p1", "lasting", 1, "ag"), hurt("p1", "lasting", -1, "ma")), { p1: { code: "lasting", stat: "ag", retire: false } });
});

test("an injury that is not one is not read: none, an unknown code, lasting without a stat, no injury at all", () => {
  assert.deepEqual(injuriesOf(hurt("p1", "none"), hurt("p1", "eaten"), hurt("p1", "lasting"), hurt("p1", "lasting", 1, "luck"), tap("p1", "injury")), {});
  assert.deepEqual(injuriesOf(hurt("p1", "miss", 1, "ag")), { p1: { code: "miss", retire: false } });
});

test("the saved numbers written back as a difference make the events read exactly as saved, and a second difference is empty", () => {
  const events = [tap("p1", "touchdowns"), tap("p1", "touchdowns"), tap("p1", "touchdowns", -1), tap("p2", "touchdowns", -1),
    hurt("p1", "miss"), hurt("p1", "dead"), hurt("p2", "niggling"), tap("ghost", "touchdowns")];
  const saved = { statistics: { p1: stats({ touchdowns: 3, completions: 1 }), p2: stats(), "journeyman-8": stats({ catches: 2 }), "star-griff": stats() },
    injuries: { p1: { code: "lasting", stat: "ma", retire: true }, p2: { code: "none" } } };
  const diff = eventsDiff(saved, events);
  assert.ok(diff.every((event) => event.delta === 1 || event.delta === -1));
  const after = statisticsFromEvents(snapshot, [...events, ...diff]);
  assert.deepEqual(after.statistics, saved.statistics);
  assert.deepEqual(after.injuries, { p1: { code: "lasting", stat: "ma", retire: false } });
  assert.deepEqual(eventsDiff(saved, [...events, ...diff]), []);
  assert.ok(!diff.some((event) => event.playerId === "ghost"));
});

test("the difference is as small as it can be: agreement writes nothing, one touchdown fewer writes one -1, three more write three +1", () => {
  const events = [tap("p1", "touchdowns"), tap("p1", "touchdowns")];
  const seeded = statisticsFromEvents(snapshot, events);
  assert.deepEqual(eventsDiff(seeded, events), []);
  seeded.statistics.p1.touchdowns = 1;
  assert.deepEqual(eventsDiff(seeded, events), [{ playerId: "p1", counter: "touchdowns", delta: -1 }]);
  seeded.statistics.p1.touchdowns = 5;
  assert.deepEqual(eventsDiff(seeded, events), Array.from({ length: 3 }, () => ({ playerId: "p1", counter: "touchdowns", delta: 1 })));
});

test("crowd and foul casualties are not counters: the difference leaves them alone", () => {
  const saved = { statistics: { p1: stats({ casualties: 1, crowdCasualties: 1 }) }, injuries: {} };
  assert.deepEqual(eventsDiff(saved, []), [{ playerId: "p1", counter: "casualties", delta: 1 }]);
});

test("an injury changed on the Players step takes back only what stands above the one wanted", () => {
  const events = [hurt("p1", "miss"), hurt("p1", "dead")];
  const wanted = (injury) => ({ statistics: { p1: stats() }, injuries: injury ? { p1: injury } : {} });
  const back = (code) => ({ playerId: "p1", counter: "injury", delta: -1, injury: { code } });
  assert.deepEqual(eventsDiff(wanted({ code: "dead", retire: false }), events), []);
  assert.deepEqual(eventsDiff(wanted({ code: "miss" }), events), [back("dead")]);
  assert.deepEqual(eventsDiff(wanted(null), events), [back("dead"), back("miss")]);
  assert.deepEqual(eventsDiff(wanted({ code: "none" }), events), [back("dead"), back("miss")]);
  assert.deepEqual(eventsDiff(wanted({ code: "lasting", stat: "st", retire: true }), events),
    [back("dead"), back("miss"), { playerId: "p1", counter: "injury", delta: 1, injury: { code: "lasting", stat: "st" } }]);
});

test("career is the blob plus what is not settled yet; a settled event is already in the blob", () => {
  const player = { id: "p1", spp: { touchdowns: 2, mvps: 1 } };
  const events = [tap("p1", "touchdowns"), { ...tap("p1", "touchdowns"), settledAt: "2026-10-16T18:00:00Z" },
    tap("p2", "touchdowns"), hurt("p1", "dead"), { ...tap("p1", "casualties"), pairingId: null }];
  assert.deepEqual(careerCounters(player, events), { ...normalizeSppCounters(), touchdowns: 3, casualties: 1, mvps: 1 });
  assert.equal(careerCounters({ id: "p1", spp: {} }, [tap("p1", "touchdowns", -1)]).touchdowns, 0);
  assert.deepEqual(careerCounters({ id: "p9" }), normalizeSppCounters());
});
```

- [ ] **Step 2: Убедиться, что падают** — Run: `node --test test/match-events.test.mjs` → FAIL `Cannot find module …/events.mjs`.

- [ ] **Step 3: `src/domain/post-match/events.mjs`**

Шапка: записи матча — то, что тренеры тапают во время игры (`match_events`, `014`); счётчики — SPP-счётчики без MVP (MVP выбирают в итогах), плюс травма; итоги берут из них статистику и травмы, шаг «Игроки» дописывает разницу, чтобы записи и итоги совпадали, завершение ставит `settled_at`; карьера — блоб плюс неучтённые; `crowdCasualties` и `foulCasualties` записями не ведутся. Суммы — по `delta` (только ±1), обрезка до 0…99 — границы `postCount`, разница — от сырых сумм. Модуль чистый.

Травмы — стек; это решение плана, тело — ровно:

```js
// The injuries still standing for one player, oldest first: +1 puts one on, -1 takes back
// the latest identical one (an undo), and a -1 with nothing to take back does nothing.
function standingInjuries(events) {
  const standing = [];
  for (const event of events) {
    const injury = eventInjury(event.injury);
    if (!injury) continue;
    if (event.delta > 0) { standing.push(injury); continue; }
    const at = standing.findLastIndex((item) => sameInjury(item, injury));
    if (at >= 0) standing.splice(at, 1);
  }
  return standing;
}
```

`eventInjury(value)` — `{ code }` для кода из `INJURIES` кроме `none`, `{ code, stat }` для `lasting` со `stat` из `PLAYER_STATS`, иначе `null` (у не-`lasting` `stat` отбрасывается). `sameInjury` — равны `code` и `stat`. Травмы в `eventsDiff`: цель — `eventInjury(injuries[id])`; пока верх стека не равен цели — снять верх (`−1` с этой травмой); если стек опустел, а цель есть — `+1` цели.

- [ ] **Step 4: Тесты** — Run: `node --test test/match-events.test.mjs` → PASS. Run: `npm test && npm run check` → PASS (`check` подтверждает чистоту `src/domain` и бюджеты).

- [ ] **Step 5: Commit**

```bash
git add src/domain/post-match/events.mjs test/match-events.test.mjs
git commit -m "feat(domain): match events — read into statistics, written back as a difference, career" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Итоги берут статистику из записей и следуют за ними (п. 2.6, домен)

**Files:**
- Modify: `src/domain/post-match/state.mjs` (`createPostSide`, `saveStatistics`), `src/domain/post-match/events.mjs` (`followEvents`), `test/post-match.test.mjs` (`fixture` и тесты в конец), `docs/superpowers/specs/2026-10-14-redesign-design.md` (§3.7)

**Interfaces:**
- Consumes: `statisticsFromEvents`, `eventsDiff`, `careerCounters`, `MatchEvent` (Task 2).
- Produces:
  - `createPostSide(source, snapshot, data)`: `source.events?: MatchEvent[]` → `statistics` и `injuries` — из `statisticsFromEvents(snapshot, source.events ?? [])`; новое поле стороны `followsEvents: true`
  - действие `statistics` (`saveStatistics`) ставит `side.followsEvents = false`
  - `followEvents(state, eventsBySide: { home?: MatchEvent[], away?: MatchEvent[] }) → state` (`events.mjs`): для каждой стороны с `followsEvents === true`, `stage <= 2` при `state.status !== 'completed'` — статистика и травмы из записей; при изменении у этой стороны `advancements = {}`. Ничего не изменилось — возвращает тот же объект; иначе — копию с `revision + 1`, вход не меняется
- В тестах: `fixture(specialRules = 'Old World Classic', events = {}, official = null)` — у источника стороны `events: events[name] ?? []`, `createPostMatch('game', sources, snapshots, data, official)`

- [ ] **Step 1: `fixture` в `test/post-match.test.mjs`** — сигнатура и два места по Interfaces; остальные тесты файла не меняются. В импорт добавить `import { careerCounters, eventsDiff, followEvents } from '../src/domain/post-match/events.mjs';`.

- [ ] **Step 2: Падающие тесты в конце `test/post-match.test.mjs`**

```js
const tap = (playerId, counter, delta = 1, injury = null) => ({ playerId, counter, delta, injury, settledAt: null });
const oneNil = { home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } };

test('the post-match starts from the match events: statistics and injuries', () => {
  const f = fixture('Old World Classic', { home: [tap('home-0', 'touchdowns'), tap('home-1', 'injury', 1, { code: 'miss' })] });
  assert.equal(f.state.home.statistics['home-0'].touchdowns, 1);
  assert.deepEqual(f.state.home.injuries, { 'home-1': { code: 'miss', retire: false } });
  assert.equal(f.state.home.followsEvents, true);
  assert.equal(f.state.away.statistics['away-0'].touchdowns, 0);
});

test('until its Players step is saved a side follows the events; a change bumps the revision and drops chosen advancements', () => {
  const f = fanSteps(agreed(fixture()));
  f.state.home.advancements = { 'home-0': [{ type: 'primary', grant: { skill: 'Block' } }] };
  const events = { home: [tap('home-0', 'completions')], away: [] };
  const followed = followEvents(f.state, events);
  assert.equal(followed.home.statistics['home-0'].completions, 1);
  assert.deepEqual(followed.home.advancements, {});
  assert.equal(followed.revision, f.state.revision + 1);
  assert.equal(followEvents(followed, events), followed);
  assert.equal(f.state.home.statistics['home-0'].completions, 0, 'the input state is left alone');
});

test('a saved Players step, a side past it and a side begun before 3.0 do not follow the events', () => {
  const events = { home: [tap('home-0', 'completions')], away: [tap('away-0', 'completions')] };
  const f = fanSteps(agreed(fixture()));
  savePlayers(f, 'home');
  assert.equal(f.state.home.followsEvents, false);
  delete f.state.away.followsEvents; // 2.x wrote no such flag
  assert.equal(followEvents(f.state, events), f.state);
  const g = fanSteps(agreed(fixture()));
  g.state.home.stage = 3;
  assert.equal(followEvents(g.state, events).home.statistics['home-0'].completions, 0);
});

test('a new result rebuilds both sides, and following the events seeds them again', () => {
  const events = { home: [tap('home-0', 'touchdowns')], away: [] };
  const f = fixture('Old World Classic', events);
  const proposed = applyPostAction(f.state, 'home', { type: 'result', ...oneNil }, f.data);
  assert.equal(proposed.home.statistics['home-0'].touchdowns, 0, 'the domain alone has no events');
  assert.equal(followEvents(proposed, events).home.statistics['home-0'].touchdowns, 1);
});

test('the score is still checked against the agreed result: two tapped touchdowns do not pass a 1-0', () => {
  const events = { home: [tap('home-0', 'touchdowns'), tap('home-1', 'touchdowns')], away: [] };
  const f = fanSteps(agreed(fixture('Old World Classic', events), oneNil));
  f.state = followEvents(f.state, events);
  f.state = applyPostAction(f.state, 'home', { type: 'statistics', statistics: f.state.home.statistics, mvps: ['home-0'] }, f.data);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data), { code: 'POST_STATISTICS', params: { counter: 'touchdowns' } });
});

test('a match the admin closed as a technical win before the post-match: the tapped touchdowns must go, and the difference takes them back', () => {
  const events = { home: [tap('home-0', 'touchdowns')], away: [] };
  const official = { mode: 'technical', official: true, winner: 'home', accepted: { home: true, away: true },
    home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } };
  const f = fanSteps(fixture('Old World Classic', events, official));
  const mvps = ['home-0', 'home-1'];
  f.state = applyPostAction(f.state, 'home', { type: 'statistics', statistics: f.state.home.statistics, mvps }, f.data);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data), { code: 'POST_STATISTICS' });
  const cleared = structuredClone(f.state.home.statistics); cleared['home-0'].touchdowns = 0;
  f.state = applyPostAction(f.state, 'home', { type: 'statistics', statistics: cleared, mvps }, f.data);
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  assert.deepEqual(eventsDiff(f.state.home, events.home), [{ playerId: 'home-0', counter: 'touchdowns', delta: -1 }]);
});

test('a tapped touchdown reaches the blob once: career shows it before the finish and after, never twice', () => {
  const events = { home: [tap('home-0', 'touchdowns')], away: [] };
  const f = fanSteps(agreed(fixture('Old World Classic', events), oneNil));
  f.state = followEvents(f.state, events);
  assert.equal(careerCounters(f.state.home.baseRoster.players[0], events.home).touchdowns, 1);
  savePlayers(f, 'home');
  const after = projectPostRoster(f.state, 'home', f.data).roster.players.find(player => player.id === 'home-0');
  const settled = [...events.home, ...eventsDiff(f.state.home, events.home)].map(event => ({ ...event, settledAt: '2026-10-16T18:00:00Z' }));
  assert.equal(after.spp.touchdowns, 1);
  assert.equal(careerCounters(after, settled).touchdowns, 1);
});
```

- [ ] **Step 3: Убедиться, что падают** — Run: `node --test test/post-match.test.mjs` → FAIL (`followEvents` не экспортирован; статистика — нули).

- [ ] **Step 4: Реализация**

`state.mjs`: `createPostSide` — по Interfaces (`const recorded = statisticsFromEvents(snapshot, source.events ?? []);`, `followsEvents: true` рядом с `statistics`); `setResult` не меняется — он строит стороны без записей, их засевает `followEvents` на сервере. `saveStatistics` — последней строкой `side.followsEvents = false;`. `events.mjs`: `followEvents` по Interfaces; изменение — сравнение `JSON.stringify([statistics, injuries])` стороны с прочитанным из записей (как `saveStatistics` сравнивает свои). Комментарий над `followEvents`: a side follows the match until its coach saves the Players step; a side begun before 3.0 has no flag and keeps the statistics it was given; the revision moves so a step sent on what the coach saw before a tap is refused instead of writing that tap away.

- [ ] **Step 5: Спека §3.7, пункт «Итоги»** — после `(чистая функция `src/domain/post-match/events.mjs::statisticsFromEvents`).` вставить: `Пока сторона не сохранила шаг «Игроки», итоги следуют за записями: каждое обращение пересчитывает её статистику и травмы, изменение поднимает ревизию итогов, и шаг, отправленный по старой ревизии, получает `POST_REVISION`. Итоги, начатые до 3.0, за записями не следуют. Травма игрока — последняя неотменённая запись травмы (`−1` снимает последнюю такую же). `crowdCasualties` и `foulCasualties` записями не ведутся: их вводят на шаге «Игроки».`

- [ ] **Step 6: Тесты** — Run: `node --test test/post-match.test.mjs test/match-events.test.mjs` → PASS. Run: `npm test && npm run check` → PASS. Падение старого теста из-за `followsEvents` или засеянной статистики — дополнить ожидание, назвать тест в сообщении коммита; поведение 2.x не меняется.

- [ ] **Step 7: Commit**

```bash
git add src/domain/post-match/state.mjs src/domain/post-match/events.mjs test/post-match.test.mjs docs/superpowers/specs/2026-10-14-redesign-design.md
git commit -m "feat(domain): post-match statistics come from the match events and follow them until the Players step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `match-events-store.mjs` — чтение, запись, учёт (п. 2.6, сервер)

**Files:**
- Create: `server/season/match-events-store.mjs`, `test/match-events-store.test.mjs`

**Interfaces:**
- Consumes: `eventsDiff`, `MatchEvent` (Task 2).
- Produces (`server/season/match-events-store.mjs`):
  - `loadMatchEvents(client, pairingId, teamIds: string[]) → Promise<Record<teamId, MatchEvent[]>>` — `SELECT saved_team_id, player_id, counter, delta, injury, settled_at FROM match_events WHERE pairing_id = $1 AND saved_team_id = ANY($2::uuid[]) ORDER BY created_at, id`; ключ есть у каждой команды из `teamIds` (пусто — `[]`)
  - `writeMatchEvents(client, { teamId, pairingId, events, actorId = null }) → Promise<number>` — один `INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())` на запись, параметры `[teamId, pairingId, playerId, counter, delta, injury ? JSON.stringify(injury) : null, actorId]`
  - `recordSideStatistics(client, pairingId, side, events, actorId = null) → Promise<MatchEvent[]>` — пишет `eventsDiff(side, events)` для `side.team.id`, возвращает `[...events, ...diff]` (у новых `settledAt: null`)
  - `settleMatchEvents(client, { teamId, pairingId }) → Promise<number>` — `UPDATE match_events SET settled_at = now() WHERE saved_team_id = $1 AND pairing_id = $2 AND settled_at IS NULL`, возвращает `rowCount`

- [ ] **Step 1: Падающие тесты `test/match-events-store.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { loadMatchEvents, recordSideStatistics, settleMatchEvents, writeMatchEvents } from "../server/season/match-events-store.mjs";
import { statisticsFromEvents } from "../src/domain/post-match/events.mjs";
import { normalizeMatchStats } from "../src/domain/post-match/statistics.mjs";
import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

function fakeClient(rows = []) {
  const log = [];
  return { log, async query(sql, values = []) { log.push({ sql: sql.trim(), values }); return { rows, rowCount: rows.length }; } };
}
const tap = (playerId, counter, delta = 1, injury = null) => ({ playerId, counter, delta, injury, settledAt: null });

test("each event is one INSERT with its own clock time, in the order given", async () => {
  const db = fakeClient();
  assert.equal(await writeMatchEvents(db, { teamId: "t1", pairingId: "g1", actorId: "u1",
    events: [tap("p1", "touchdowns"), tap("p1", "injury", -1, { code: "dead" })] }), 2);
  assert.deepEqual(db.log.map((entry) => entry.values),
    [["t1", "g1", "p1", "touchdowns", 1, null, "u1"], ["t1", "g1", "p1", "injury", -1, '{"code":"dead"}', "u1"]]);
  assert.ok(db.log.every((entry) => entry.sql.startsWith("INSERT INTO match_events") && /clock_timestamp\(\)/.test(entry.sql)));
});

test("no events, no statement", async () => {
  const db = fakeClient();
  assert.equal(await writeMatchEvents(db, { teamId: "t1", pairingId: "g1", events: [] }), 0);
  assert.deepEqual(db.log, []);
});

test("the Players step writes only the difference, and hands back the events as they now stand", async () => {
  const db = fakeClient();
  const side = { team: { id: "t1" }, statistics: { p1: { ...normalizeMatchStats(), touchdowns: 1 } }, injuries: {} };
  const now = await recordSideStatistics(db, "g1", side, [tap("p1", "touchdowns"), tap("p1", "touchdowns")], "u1");
  assert.deepEqual(db.log.map((entry) => entry.values), [["t1", "g1", "p1", "touchdowns", -1, null, "u1"]]);
  assert.equal(statisticsFromEvents({ players: [{ id: "p1" }] }, now).statistics.p1.touchdowns, 1);
  const again = fakeClient();
  assert.deepEqual(await recordSideStatistics(again, "g1", side, now, "u1"), now);
  assert.deepEqual(again.log, []);
});

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = id(1), U2 = id(2), T1 = id(11), T2 = id(12), T3 = id(13), G1 = id(41), G2 = id(42);

async function twoFriendlies(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'a', 'a', '@a', 'x'), ($2, 'b', 'b', '@b', 'x')", [U1, U2]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $4, 'A', 'teams/human'), ($2, $5, 'B', 'teams/human'), ($3, $5, 'C', 'teams/human')",
    [T1, T2, T3, U1, U2]);
  for (const [pairing, table] of [[G1, 1], [G2, 2]]) {
    await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id) VALUES ($1, 'friendly', $2, $3, $4, $5, $6)`, [pairing, table, U1, U2, T1, T2]);
  }
}

test("on a real database: a match's events come back per team, oldest first; settling takes only that team's open events of that match, once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoFriendlies(client);
    await client.query("BEGIN");
    await writeMatchEvents(client, { teamId: T1, pairingId: G1, actorId: U1,
      events: [tap("p1", "touchdowns"), tap("p1", "injury", 1, { code: "lasting", stat: "ag" }), tap("p1", "touchdowns", -1)] });
    await writeMatchEvents(client, { teamId: T2, pairingId: G1, events: [tap("journeyman-8", "catches")] });
    await writeMatchEvents(client, { teamId: T1, pairingId: G2, events: [tap("p1", "touchdowns")] });
    await client.query("COMMIT");
    const loaded = await loadMatchEvents(client, G1, [T1, T2, T3]);
    assert.deepEqual(loaded[T1], [tap("p1", "touchdowns"), tap("p1", "injury", 1, { code: "lasting", stat: "ag" }), tap("p1", "touchdowns", -1)]);
    assert.deepEqual(loaded[T2], [tap("journeyman-8", "catches")]);
    assert.deepEqual(loaded[T3], []);
    assert.equal(await settleMatchEvents(client, { teamId: T1, pairingId: G1 }), 3);
    assert.equal(await settleMatchEvents(client, { teamId: T1, pairingId: G1 }), 0);
    const open = (await client.query("SELECT saved_team_id, pairing_id FROM match_events WHERE settled_at IS NULL ORDER BY pairing_id")).rows;
    assert.deepEqual(open, [{ saved_team_id: T2, pairing_id: G1 }, { saved_team_id: T1, pairing_id: G2 }]);
    assert.ok((await loadMatchEvents(client, G1, [T1]))[T1].every((event) => event.settledAt instanceof Date));
  });
});
```

- [ ] **Step 2: Убедиться, что падают** — Run: `. output/02b/env.sh && node --test test/match-events-store.test.mjs` → FAIL `Cannot find module …/match-events-store.mjs`.

- [ ] **Step 3: `server/season/match-events-store.mjs`** — по Interfaces. Шапка: единственное место, где сервер пишет и учитывает записи матча; вызывается только внутри транзакции итогов, под её блокировками (пара и обе команды `FOR UPDATE`, строка итогов `FOR UPDATE`), после её проверок — поэтому отказ не оставляет строк, а повтор пишет пустую разницу; `clock_timestamp()` вместо `now()`, чтобы строки одной транзакции сохранили порядок (травма — последняя неотменённая); строка — в форме домена (`playerId`, `settledAt`).

- [ ] **Step 4: Тесты** — Run: `. output/02b/env.sh && node --test test/match-events-store.test.mjs` → PASS. Run: `. output/02b/env.sh && npm test && npm run check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/season/match-events-store.mjs test/match-events-store.test.mjs
git commit -m "feat(matches): match events store — load a match's events, write a difference, settle once" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Итоги на сервере: записи на входе, разница шага «Игроки», учёт при завершении (п. 2.6)

**Files:**
- Modify: `server/season/post-match.mjs` (`postSources`, `accessPostMatch`, `finishPost`), `test/helpers/scratch-db.mjs` (`withServerPool`), `scripts/smoke-post-match.mjs` (`verify`), `docs/superpowers/specs/2026-10-14-redesign-design.md` (§3.7)
- Create: `test/post-match-events-db.test.mjs`

**Interfaces:**
- Consumes: `followEvents`, `createPostSide` с `source.events` (Task 3); `loadMatchEvents`, `recordSideStatistics`, `settleMatchEvents` (Task 4).
- Produces:
  - `postSources(client, fixture)` дополнительно ставит `sources[name].events` — записи этого матча для команды стороны (`loadMatchEvents(client, fixture.id, [home, away])`)
  - `accessPostMatch` — `followEvents` после `loadPost` и ещё раз после действия; после действия `statistics` — `recordSideStatistics` для этой стороны, и в локальные записи попадает результат
  - `finishPost` — для каждой стороны после `applyPostMatchRoster`: `recordSideStatistics(client, fixture.id, state[name], sources[name].events, actorId)`, затем `settleMatchEvents(client, { teamId: state[name].team.id, pairingId: fixture.id })`
  - `withServerPool(url, run) → Promise<any>` (`test/helpers/scratch-db.mjs`) — `pool` сервера (`server/db/pool.mjs`) на время `run` отвечает из этой базы: `query` и `connect` настоящего `pg.Pool`, после — прежние методы и `end()`

- [ ] **Step 1: `withServerPool` в `test/helpers/scratch-db.mjs`** — по Interfaces, с doc-комментарием: route code runs unchanged against the throwaway database, with real connections and real locks, so concurrent requests are tested as they happen.

- [ ] **Step 2: Падающие тесты `test/post-match-events-db.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch } from "../server/season/post-match.mjs";
import { matchReference } from "../server/domain/match-reference.mjs";
import { createMatchSide } from "../src/domain/match/roster.mjs";
import { scratchSkip, withScratchDatabase, withServerPool } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const G = id(41), SIDES = ["home", "away"];
const coaches = { home: { id: id(1), is_admin: false }, away: { id: id(2), is_admin: false } };
const teams = { home: id(11), away: id(12) };
const roster = (name) => ({ treasury: 150, players: Array.from({ length: 7 }, (_, i) =>
  ({ id: `${name}-${i}`, rowIndex: 0, number: String(i + 1), name: `Player ${i + 1}` })) });

/** A friendly that has started: two Human teams, the pairing and both snapshots, as startPreparedMatch leaves them. */
async function startedFriendly(client) {
  const data = await matchReference();
  for (const name of SIDES) {
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, $2, $2, '@c', 'x')", [coaches[name].id, name]);
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, $3, 'teams/human', $4)",
      [teams[name], coaches[name].id, name, JSON.stringify(roster(name))]);
  }
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, preparation_status) VALUES ($1, 'friendly', 1, $2, $3, $4, $5, 'in_progress')`,
  [G, coaches.home.id, coaches.away.id, teams.home, teams.away]);
  for (const name of SIDES) {
    const source = { user: { id: coaches[name].id, login: name }, gamesPlayed: 0,
      team: { id: teams[name], name, revision: 1, baseTeamSlug: "teams/human", roster: roster(name) } };
    await client.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) VALUES ($1, $2, $3, $4)",
      [G, name, teams[name], JSON.stringify({ ...createMatchSide(source, data), fanFactor: 2, effects: {} })]);
  }
}

/** What 03's endpoint will write for a tap. */
const tap = (client, team, playerId, counter, delta = 1) => client.query(
  "INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta) VALUES ($1, $2, $3, $4, $5)", [team, G, playerId, counter, delta]);

const totals = async (client, team) => (await client.query(`SELECT player_id, counter, sum(delta)::int AS total, count(*)::int AS rows,
    bool_and(settled_at IS NOT NULL) AS settled FROM match_events WHERE pairing_id = $1 AND saved_team_id = $2
  GROUP BY player_id, counter ORDER BY player_id, counter`, [G, team])).rows;
const spp = async (client, name, playerId) => (await client.query("SELECT roster FROM saved_teams WHERE id = $1", [teams[name]]))
  .rows[0].roster.players.find((player) => player.id === playerId).spp;

/** One coach's step, through the server function the route calls. */
const act = async (name, state, action, finish = false) =>
  (await accessPostMatch(G, coaches[name], { revision: state.revision, ...(finish ? {} : { action }) }, finish)).postMatch;

/** A 1-0 agreed and the fans rolled: both sides on the Players step. */
async function toPlayersStep() {
  let state = (await accessPostMatch(G, coaches.home)).postMatch;
  state = await act("home", state, { type: "result", home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
  state = await act("away", state, { type: "agree-result" });
  for (const name of SIDES) state = await act(name, state, { type: "fans", roll: 3 });
  return state;
}

/** The Players step with `statistics(name, side)`, then every later step, up to ready. */
async function toReady(state, statistics) {
  for (const name of SIDES) state = await act(name, state, { type: "statistics", statistics: statistics(name, state[name]), mvps: [`${name}-6`] });
  for (const type of ["lock-players", "lock-roster"]) for (const name of SIDES) state = await act(name, state, { type });
  for (const name of SIDES) state = await act(name, state, { type: "finance", deposit: 0, mistake: { roll: 6 } });
  for (const name of SIDES) state = await act(name, state, { type: "next", captain: `${name}-0` });
  for (const name of SIDES) state = await act(name, state, { type: "confirm" });
  assert.equal(state.status, "ready");
  return state;
}

const homeScores = (name, side) => name === "home"
  ? { ...side.statistics, "home-0": { ...side.statistics["home-0"], touchdowns: 1 } } : side.statistics;

test("a match tapped in 3.0: the post-match starts from the taps, the Players step corrects them, the finish settles them once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    for (const delta of [1, 1, -1]) await tap(client, teams.home, "home-0", "touchdowns", delta);
    await tap(client, teams.home, "home-1", "completions");
    await withServerPool(url, async () => {
      const state = await toPlayersStep();
      assert.equal(state.home.statistics["home-0"].touchdowns, 1);
      assert.equal(state.home.statistics["home-1"].completions, 1);
      const corrected = (name, side) => name === "home"
        ? { ...side.statistics, "home-1": { ...side.statistics["home-1"], completions: 0 } } : side.statistics;
      assert.equal((await act("home", await toReady(state, corrected), null, true)).status, "completed");
    });
    assert.deepEqual(await totals(client, teams.home), [
      { player_id: "home-0", counter: "touchdowns", total: 1, rows: 3, settled: true },
      { player_id: "home-1", counter: "completions", total: 0, rows: 2, settled: true }]);
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1);
    assert.equal((await spp(client, "home", "home-1")).completions, 0);
  });
});

test("a post-match from 2.x — statistics in its state, no events — finishes in 3.0: SPP grow once, the finish writes the events and settles them", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      // What 2.x leaves: the same state without the flag, and no events at all.
      await client.query("DELETE FROM match_events WHERE pairing_id = $1", [G]);
      await client.query("UPDATE match_post_games SET state = state #- '{home,followsEvents}' #- '{away,followsEvents}' WHERE pairing_id = $1", [G]);
      assert.equal((await act("home", ready, null, true)).status, "completed");
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: true }]);
    assert.deepEqual(await totals(client, teams.away), []);
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1);
  });
});

test("a tap after the post-match was opened reaches it before the Players step is saved, and a step sent on the old revision is refused", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const opened = (await accessPostMatch(G, coaches.home)).postMatch;
      await tap(client, teams.home, "home-0", "touchdowns");
      await assert.rejects(act("home", opened, { type: "result", home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }),
        { code: "POST_REVISION" });
      const reread = (await accessPostMatch(G, coaches.home)).postMatch;
      assert.equal(reread.home.statistics["home-0"].touchdowns, 1);
      assert.ok(reread.revision > opened.revision);
    });
  });
});

test("the Players step sent twice on one revision writes its difference once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const state = await toPlayersStep();
      const step = { type: "statistics", statistics: homeScores("home", state.home), mvps: ["home-6"] };
      const results = await Promise.allSettled([act("home", state, step), act("home", state, step)]);
      assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
      assert.equal(results.find((result) => result.status === "rejected").reason.code, "POST_REVISION");
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: false }]);
  });
});

test("two coaches finishing at once settle the events once and grow SPP once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      const finished = await Promise.all(SIDES.map((name) => act(name, ready, null, true)));
      assert.ok(finished.every((state) => state.status === "completed"));
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: true }]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM match_post_applications WHERE pairing_id = $1", [G])).rows[0].n, 2);
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1);
  });
});

test("a finish refused for a changed team settles nothing and writes no difference", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      await client.query("UPDATE saved_teams SET revision = revision + 1 WHERE id = $1", [teams.away]);
      await assert.rejects(act("home", ready, null, true), { code: "POST_TEAM_CHANGED" });
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: false }]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM match_post_applications WHERE pairing_id = $1", [G])).rows[0].n, 0);
  });
});
```

- [ ] **Step 3: Убедиться, что падают** — Run: `npm run build && . output/02b/env.sh && node --test test/post-match-events-db.test.mjs` → FAIL (статистика итогов — нули, записей разницы и `settled_at` нет).

- [ ] **Step 4: `server/season/post-match.mjs`**

`postSources`: после запроса `gamesPlayed` — `loadMatchEvents` по Interfaces и `sources[name].events`. `finishPost`: две строки после `applyPostMatchRoster` по Interfaces, комментарий: the difference once more (a post-match begun before 3.0 has no events; a tap may have landed after the Players step), then settled in this same transaction, so settled events always add up to what the blob took in. `accessPostMatch` — порядок фиксирован; тело (до `savePost`):

```js
    const fixture = await loadPreparationFixture(client, pairingId, user), sources = await postSources(client, fixture);
    // Read under the pairing and team locks taken above, so no tap lands between this read and the writes below.
    const events = Object.fromEntries(SIDES.map(name => [name, sources[name].events]));
    let state = followEvents(await loadPost(client, fixture, sources, data), events);
    const viewerSide = fixture.home_user_id === user.id ? 'home' : 'away';
    if (body && !(finish && state.status === 'completed')) {
      const name = body.side || viewerSide;
      if (!SIDES.includes(name) || (!user.is_admin && fixture[name + '_user_id'] !== user.id)) throw httpError(403, 'FIXTURE_NOT_YOURS');
      if (Number(body.revision) !== state.revision) throw httpError(409, 'POST_REVISION');
      if (state.status === 'completed') throw httpError(409, 'POST_CLOSED');
      if (body.action?.type === 'reset-side') state = resetSide(state, name, sources, data);
      else {
        if (sources[name].team.revision !== state[name].baseRevision) throw httpError(409, 'POST_TEAM_CHANGED');
        if (finish) state = await finishPost(client, fixture, state, sources, data, user.id);
        else {
          state = applyPostAction(state, name, body.action, data);
          if (body.action?.type === 'statistics') events[name] = await recordSideStatistics(client, fixture.id, state[name], events[name], user.id);
        }
      }
      state = followEvents(state, events);
    }
```

`resetSide(state, name, sources, data)` — локальная функция: тело нынешней ветки `reset-side` без изменений (сторона из `createPostSide(sources[name], …)` уже засеяна записями). `accessPostMatch` остаётся короче 80 строк (`npm run check`).

- [ ] **Step 5: `scripts/smoke-post-match.mjs`** — в `verify(f)`:
  - помощник рядом с `verify`:

```js
async function matchEvents(f) {
  return (await pool.query(`SELECT saved_team_id, counter, sum(delta)::integer AS total, count(*)::integer AS rows, count(settled_at)::integer AS settled
    FROM match_events WHERE pairing_id=$1 GROUP BY saved_team_id, counter ORDER BY saved_team_id, counter`, [f.gameId])).rows;
}
const byTeam = (rows, team) => Object.fromEntries(rows.filter(row => row.saved_team_id === team).map(row => [row.counter, row.total]));
```

  - после отказа `POST_TEAM_CHANGED`: `assert.ok((await matchEvents(f)).every(row => row.settled === 0), 'a refused finish settles nothing');`
  - после успешных завершений (рядом с проверкой `count === 2`):

```js
  const events = await matchEvents(f);
  assert.deepEqual(byTeam(events, f.teamIds[0]), { casualties: 1, injury: 1, touchdowns: 2 });
  assert.deepEqual(byTeam(events, f.teamIds[1]), { touchdowns: 1 });
  assert.ok(events.every(row => row.settled === row.rows), 'every event of the match is settled');
```

  - после повторного завершения: `assert.deepEqual(await matchEvents(f), events);`
  - итоговая строка: `… recovery, idempotent completion and match events settled once.`

- [ ] **Step 6: Спека §3.7, пункт «Итоги»** — `finishPost` в той же транзакции, где `applyPostMatchRoster`, ставит `settled_at = now()` записям матча.` → `finishPost` в той же транзакции, где `applyPostMatchRoster`, ещё раз дописывает разницу (у итогов, начатых до 3.0, записей нет; тап мог прийти после шага «Игроки») и ставит `settled_at = now()` записям матча этой команды — учтённые записи всегда равны применённой статистике.`

- [ ] **Step 7: Тесты и проверки** — Run: `. output/02b/env.sh && node --test test/post-match-events-db.test.mjs` → PASS (6 tests). Run: `. output/02b/env.sh && npm test && npm run check && npm run i18n:check` → PASS, `# skipped 0`.

- [ ] **Step 8: Рецепт С, все четыре smoke** — Expected: каждый `… passed …`; `smoke:post-match` — с новой строкой про записи матча (настоящий `INSERT` разницы и `UPDATE settled_at`, параллельные завершения, повтор).

- [ ] **Step 9: Commit**

```bash
git add server/season/post-match.mjs test/helpers/scratch-db.mjs test/post-match-events-db.test.mjs scripts/smoke-post-match.mjs docs/superpowers/specs/2026-10-14-redesign-design.md
git commit -m "feat(matches): post-match reads the match events, writes the Players step difference, settles them at the finish" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Итоговая проверка этапа и заметки для 03 и 12

- [ ] **Step 1: Полный прогон**

```bash
npm run build && . output/02b/env.sh && npm test && npm run check && npm run i18n:check
```

Expected: всё PASS, `# skipped 0`; одинаковое число страниц EN/RU, 0 fallback; `check` без превышений бюджетов.

- [ ] **Step 2: Проверки протокола (шаг 8 мастер-плана)**

```bash
git diff --name-only origin/redesign -- src | xargs grep -nE ">[A-ZА-Я]" || true
python3 -c "import json
for f in ('src/i18n/en.json','src/i18n/ru.json'):
    seen=set()
    def hook(pairs):
        for k,_ in pairs:
            assert k not in seen, f'duplicate key {k} in {f}'; seen.add(k)
        return dict(pairs)
    json.load(open(f,encoding='utf-8'),object_pairs_hook=hook)
print('i18n keys unique')"
git diff --name-only origin/redesign -- src/i18n server/http/errors.mjs
shasum -a 256 server/db/migrations/*.sql
git diff --name-only origin/redesign -- server/db/migrations | grep -v '^server/db/migrations/014_match_events.sql$' || true
```

Expected: grep ничего не находит (разметки этап не трогает); `i18n keys unique`; словари и `errors.mjs` не изменены (новых кодов нет); суммы записать для тела PR; последняя команда пуста — применённые миграции не тронуты.

- [ ] **Step 3: Миграции на чистой и на рабочей базе** (PR-CHECKLIST)

```bash
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_smoke_02b
npm run db:migrate -- --check
```

Expected: `database is up to date` на dev-базе. Затем рецепт С целиком (база создаётся заново, `db:migrate` применяет 001…015 подряд, `014` раньше `015`) и все четыре smoke → `… passed …`. Остановить фоновый сервер.

- [ ] **Step 4: Финальная репетиция** — рецепт Р. Expected: как в рецепте целиком, семь миграций.

- [ ] **Step 5: Заметки в мастер-плане** — `docs/superpowers/plans/2026-10-14-redesign-rollout.md`, раздел «Дополнения к этапам». Пункт **03.** дополнить строками:

```markdown
- Записи матча (из 02b). `POST /api/teams/:id/events` сначала берёт блокировки итогов (`loadPreparationFixture` — пара `FOR UPDATE OF p`, затем обе команды) и только потом пишет через `writeMatchEvents` (`server/season/match-events-store.mjs`): так тап упорядочен с разницей шага «Игроки» и с `finishPost`. `playerId` — из снимка своей стороны; `counter = 'injury'` — только с `injury` `{code из INJURIES без none, stat для lasting}`, у остальных счётчиков `injury` нет. `MATCH_NOT_LIVE` (+ `API_ERRORS`, оба словаря): подготовка не `in_progress` или итоги `completed`. Решить, принимать ли тап стороны, уже сохранившей шаг «Игроки»: в 02b такой тап не попадает в её статистику, и разница при завершении его снимает.
- Правка вне матча (спека 3.0 §3.7) — здесь целиком: `PATCH /api/teams/:id` пишет учтённые записи (`pairing_id NULL`, `settled_at = now()`) по разнице `player.spp` без MVP, в своей транзакции; во время матча — запись без пары и без `settled_at`; `finishPost` переносит неучтённые записи команды без пары в блоб и ставит им `settled_at` в своей транзакции. В 02b `finishPost` учитывает только записи своего матча, а `careerCounters` уже считает все неучтённые.
- Карьера и история — `careerCounters` и `statisticsFromEvents` из `src/domain/post-match/events.mjs`.
```

Пункт **12.** дополнить строкой:

```markdown
- Брошенный матч (из 02b): «админ может закрыть матч технически, тогда записи учитываются или удаляются» (спека 3.0 §3.7) — в плане 3.0 этого действия нет; без него записи брошенного матча навсегда остаются «ждёт итогов». Решение — у владельца.
```

```bash
git add docs/superpowers/plans/2026-10-14-redesign-rollout.md
git commit -m "docs(plan): notes for stages 03 and 12 from 02b — the events endpoint, edits outside a match, abandoned matches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Сводка для PR** — пункт 2.6 плана 3.0; вывод шагов 1–4; правки спеки §3.7 (`CASCADE`, следование за записями, травма и счётчики, разница при завершении); «Решения этого плана»; заметки для 03 и 12.

- [ ] **Step 7: После слияния PR** (протокол, шаг 10; не в этой ветке)

```bash
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_seed_02b
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_smoke_02b
rm -rf output/02b
```

Чекбокс 2.6 в плане 3.0 и строка 02b в таблице мастер-плана — коммитом `docs(plan): stage 02b done (PR #N)` в `redesign`.

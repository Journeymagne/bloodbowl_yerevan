# Редизайн 3.0 · мастер-план исполнения и переезда

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** провести редизайн 3.0 цепочкой PR (этапы П, 01, 2–13) с вехами для владельца и перевезти боевой сайт на 3.0 за одно окно до часа, без потери данных и с проверенным откатом.

**Architecture:** работа идёт волнами. Сначала релиз 2.1.0 в `main`: механика переезда работает на проде заранее. Затем инструменты репетиции (этап 01). Дальше два трека этапов 2–5, экранные этапы 6–13 (не больше двух одновременно), вехи M1–M5 с репетициями на обезличенной копии боевой базы. В конце PR `redesign → main` в день X по runbook. Детальный план каждого этапа 2–13 пишется при его старте (writing-plans), по протоколу ниже.

**Tech Stack:** Node.js, vanilla ES-модули, PostgreSQL 16 (Docker), pm2, GitHub Actions, общий Caddy; агенты Claude Code (subagent-driven-development, worktrees).

**Spec:** `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md` (спека выката) и `docs/superpowers/specs/2026-10-14-redesign-design.md` (спека 3.0). Этапы и чекбоксы: `docs/superpowers/plans/2026-10-14-redesign.md` (план 3.0). Детальные планы: `plans/2026-10-14-release-2.1.0.md` (этап П), `plans/2026-10-14-rehearsal-tooling.md` (этап 01).

## Global Constraints

- Ветки: `release/2.1.0` от `main` → PR в `main`; этапы `rd/NN-…` от свежей `redesign` → PR в `redesign`. В `main` вливает **только владелец**; в `redesign` — Claude после проверок и ревью.
- После выхода 2.1.0 `main` заморожен: только фиксы багов. Каждый фикс Claude сразу вливает в `redesign` (`git merge origin/main`).
- Одновременно открыто не больше двух этапных веток с экранами; слияния в `redesign` — по одному, следующая ветка ребейзится на свежую `redesign`.
- Каждый PR зелёный: `npm test && npm run check && npm run i18n:check && npm run build`, плюс `npm run smoke` и `smoke:pre-match / smoke:friendly / smoke:post-match` для этапов, трогающих матчи; `npm run build && npm run i18n:check` — одинаковое число страниц EN/RU, 0 fallback.
- Правила и числа — из `content/Gata/**` и `src/domain/**`. Если контент и код расходятся **между собой**, трек останавливается до ответа владельца (спека 3.0 §0.12). Расхождения макета с кодом правятся по коду без вопроса.
- Миграции только добавляют (спека 3.0 §0.13); применённый файл не правится. После первой репетиции, на которой миграция применилась, её изменение = новая миграция **и** повтор репетиции.
- Без новых зависимостей, фреймворков, сборщика. CSP без inline JS и `style="…"`.
- В репозиторий не попадает ничего из боевого дампа; отчёты репетиций в репозитории — только сводки.
- SSH к серверу у Claude нет: все серверные шаги — готовые команды для владельца (`sudo -i`), Claude читает вывод.
- Ответы владельцу — по-русски; комментарии в коде — по-английски.

## Review Focus

1. **Worktree поднялся на чужой ветке** → агент начинает этап с неверной базы. Протокол, шаг 2, сверяет `git rev-parse HEAD` с `origin/redesign` и останавливается при расхождении.
2. **Два параллельных этапа добавили ключи в `en.json`/`ru.json`, при ребейзе ключ потерялся или задублировался** → JSON молча берёт последнее значение. Протокол, шаг 8, проверяет дубли ключей скриптом из шага 8.
3. **Миграцию поправили после репетиции** → отчёт вехи врёт. Протокол, шаг 8, сравнивает чек-суммы `server/db/migrations/*.sql` с записанными в отчёте последней репетиции.
4. **Между предполётной проверкой и `maintenance:on` тренер начал матч** → фаза X, шаг T+8, повторяет запрос открытых состояний уже при включённом техобслуживании.
5. **3.0 требует чего-то, что режет боевой CSP** (шрифт, inline-стиль, внешний адрес) → веха M5 проходит собранный сайт под точной политикой из `deploy/caddy/…conf`.

---

## Фаза 0 · Документы и PR #10 (Claude, сразу после одобрения этого плана)

### Task 0.1: План 3.0 под решения 2026-10-14

**Files:** Modify: `docs/superpowers/plans/2026-10-14-redesign.md`

- [x] **Step 1:** В «Как устроена работа» после пункта «Ветки» добавить:

```markdown
- **Исполнение и выкат.** Порядок PR, протокол этапа, вехи M1–M5 и runbook дня X — в `plans/2026-10-14-redesign-rollout.md` (спека выката — `specs/2026-10-14-redesign-rollout-design.md`). Этапные PR в `redesign` открывает и вливает Claude; в `main` — только владелец.
```

- [x] **Step 2:** В этапе 0 добавить `- [x] Спека выката и мастер-план исполнения (2026-10-14)`. В этапе 1 заменить `- [ ] Ответ владельца на §9.6 (быстрый счёт без подготовки)` на `- [x] Ответ владельца на §9.6: быстрый счёт у тренера убрать (2026-10-14)`.

- [x] **Step 3:** Перед `## Этап 2 · База данных и домен` вставить:

```markdown
## Этап П · Релиз 2.1.0 в `main` (`release/2.1.0`)
Детальный план: `plans/2026-10-14-release-2.1.0.md`. Спека выката §1.
- [ ] Режим техобслуживания: флаг-файл, 503, страница `public/maintenance/`, обход только с loopback, `maintenance:on|off|status`
- [ ] Открытые вкладки перезагружаются по `MAINTENANCE`
- [ ] `deploy:migrate`: дамп `premigrate` перед миграциями
- [ ] Слияние владельцем, проба на проде, тег `v2.1.0`, `main` влит в `redesign`

## Этап 01 · Инструменты репетиции (`rd/01-rehearsal`)
Детальный план: `plans/2026-10-14-rehearsal-tooling.md`. Спека выката §3.
- [ ] Перенос из PR #9 (`scripts/lib/render-table.mjs`, заметка глоссария); PR #9 закрыт
- [ ] `rehearsal:restore`, `rehearsal:migrate`, `rehearsal:check`

```

- [x] **Step 4:** В 2.1 заменить строку `  - Все существующие и новые команды пока создаются в `active`; `draft` включается на этапе 12.` на:

```markdown
  - Существующие команды: `active`, если есть неотозванная заявка в текущий сезон или сыгранный матч, иначе `draft` (спека 3.0 §0.6, §3.1; SQL — мастер-план, этап 02a). Новые команды до этапа 12 создаются в `active`.
```

В 2.3 после строки про `011_fallen_players.sql` добавить:

```markdown
  - `015_backfill_fallen_players.sql`: погибшие из итогов матчей, сыгранных до 3.0 (спека 3.0 §3.3).
```

- [x] **Step 5:** В этапе 3 заменить пункт `- [ ] Режим техобслуживания: …` на строку без чекбокса `- Режим техобслуживания вышел в релизе 2.1.0 (этап П); здесь не трогается.` В пункте `scripts/smoke-api.mjs` убрать слово «техобслуживание».

- [x] **Step 6:** В этапе 9 заменить пункт `- [ ] Быстрый счёт без подготовки: по ответу на §9.6 …` на:

```markdown
- [ ] Быстрый счёт у тренера убрать (§9.6): форма `components/games/result-fields.mjs` в режиме тренера удаляется, `proposeGameResult` остаётся для админа
- [ ] `npm run rehearsal:transitions` — сквозной тест переходных состояний 2.x → 3.0 (спека выката §3.3)
```

- [x] **Step 7:** В этапе 12 добавить:

```markdown
- [ ] «Добавить погибшего задним числом» (`POST /api/admin/teams/:id/fallen`, спека 3.0 §3.3)
- [ ] Ввод и подтверждение админом счетов, предложенных до 3.0 и не подтверждённых
```

- [x] **Step 8:** В этапе 13 заменить пункт `- [ ] План выката:` вместе с шестью вложенными строками на:

```markdown
- [ ] Раздел «Переезд на 3.0» в `DEPLOYMENT.md`: runbook дня X (команды — мастер-план, фаза X; спека выката §6)
- [ ] Финальная репетиция на свежем дампе, веха M5 (go / no-go)
```

- [x] **Step 9:** Блок `## Порядок и зависимости` заменить на:

````markdown
## Порядок и зависимости

```
П (2.1.0 в main) ─ 01 (репетиция) ─┬─ 02a ─ 02b ─ 03 ──┐
                                    └─ 04 ─── 05 ───────┴─ M1
M1 ─ 06 ∥ 11 ─ 07a…07e ∥ 08 ─ M2 ─ 09a ─ 09b ─ 09c ∥ 10 ─ M3 ─ 12 ─ M4 ─ 13 ─ M5 ─ день X
```

Подробно — `plans/2026-10-14-redesign-rollout.md`.
````

- [x] **Step 10: Commit**

```bash
git add docs/superpowers/plans/2026-10-14-redesign.md
git commit -m "docs(redesign): plan 3.0 — stages П and 01, owner's answers, milestones"
```

### Task 0.2: Handoff, спецификация интерфейса, мелкие правки спек

**Files:** Modify: `docs/redesign/handoff-0.9.1/README.md`, `docs/redesign/handoff-0.9.1/PROMPTS.md`, `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`, `docs/superpowers/specs/2026-10-14-redesign-design.md`, `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md`

- [x] **Step 1: `README.md` handoff**
  - Строку `- Коммиты — на этапной ветке; пуш и PR делает владелец (или по его явной просьбе).` заменить на `- Коммиты — на этапной ветке. Этапные PR в `redesign` открывает и вливает Claude после проверок и ревью; в `main` вливает только владелец. Протокол — `docs/superpowers/plans/2026-10-14-redesign-rollout.md`.`
  - Абзац `**Открытый вопрос (§9.6):** …` заменить на `**§9.6 закрыт (2026-10-14):** у тренера только подготовка → итоги; форму быстрого счёта убрать на этапе 9, `proposeGameResult` оставить для админа.`
  - В «Ключевых решениях» пункт 4 заменить на `4. При переезде `active` — команды в текущем сезоне или уже игравшие, остальные `draft`; новые команды получают `draft` с этапа 12.`
  - В «Что читать и в каком порядке» после пункта 2 вставить `2a. **Мастер-план выката:** `docs/superpowers/plans/2026-10-14-redesign-rollout.md` — цепочка PR, протокол этапа, вехи, день X.`
  - Блок «Порядок этапов» заменить ссылкой: `Порядок этапов, параллельность и вехи — в мастер-плане выката.`

- [x] **Step 2: `PROMPTS.md`**
  - В общем префиксе `Не пушь.` заменить на `Пуш, PR и слияние — по протоколу мастер-плана `docs/superpowers/plans/2026-10-14-redesign-rollout.md`.`
  - В промпте этапа 3 удалить предложение, начинающееся с `Режим техобслуживания: флаг-файл`, до конца этого предложения; добавить `Режим техобслуживания уже в `main` (релиз 2.1.0) — не трогать.`
  - В промпте этапа 4 после `theme.mjs и theme-boot.js: …` добавить `Кеш выбора — `gata-league-palette` (JSON `{mode, light, dark}`), таблицы палитр и старых тем — как в `public/maintenance/palettes.mjs` (тест на совпадение).`
  - В промпте этапа 9 `Быстрый счёт без подготовки — не трогать до ответа на §9.6.` заменить на `Форму быстрого счёта у тренера удалить (§9.6); `proposeGameResult` оставить для админа.`

- [x] **Step 3: Спецификация интерфейса §30.** Пункт, начинающийся `- Как это работает без приложения:`, заменить на:

```markdown
- Как это работает без приложения (пересмотрено 2026-10-14, спека выката §1.2): страница на том же адресе и читает кеш выбора в localStorage — `gata-league-palette` из 3.0, иначе `gata-league-theme` из 2.x. Свои CSS и JS внешними файлами (`public/maintenance/`), без `theme-boot.js` и `tokens.css`. Отдаёт её Node во время работ; nginx на проде нет, при упавшем Node Caddy отвечает 502.
```

- [x] **Step 4: Спека 3.0 §3.5.** После абзаца про `theme-boot.js` добавить: `Кеш выбора в localStorage — ключ `gata-league-palette`, JSON `{mode: "light"|"dark"|"system", light, dark}`; его же читает страница техобслуживания (спека выката §1.2). Таблица перевода шести старых тем — `LEGACY_THEME_PALETTE` в `public/maintenance/palettes.mjs`.`

- [x] **Step 5: Спека выката §3.1.** Строку `  - TV каждой команды (через `src/domain`) и очки таблицы сезона совпадают;` заменить на `  - результаты и очки таблицы сезона совпадают; TV не пересчитывается: миграции не меняют ни блоб, ни справочные данные, поэтому совпадение блоба означает совпадение TV;`

- [x] **Step 6: Commit**

```bash
git add docs/redesign/handoff-0.9.1/README.md docs/redesign/handoff-0.9.1/PROMPTS.md docs/superpowers/specs/
git commit -m "docs(redesign): handoff, UI spec §30 and specs aligned with the rollout plan"
```

### Task 0.3: PR #10 в `redesign`

- [x] **Step 1:** `git push origin rd/00-plan`
- [x] **Step 2:** Обновить описание PR #10: что внутри (спека 3.0, план 3.0, handoff 0.9.1, спека выката, мастер-план, планы П и 01), строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
gh pr edit 10 --body-file <scratchpad>/pr-10.md
```

- [x] **Step 3:** `gh pr merge 10 --merge`, затем `git fetch origin && git log --oneline -1 origin/redesign`. Чекбоксы фазы 0 в этом плане отмечаются в ветке этапа 01 вместе с его собственными.

---

## Фаза П · Релиз 2.1.0

- [x] Исполнить `plans/2026-10-14-release-2.1.0.md` (Tasks 0–9) — subagent-driven-development в worktree `../bb-release-2.1.0`.
- [x] Владелец вливает PR в `main`; проба на проде (Task 10, Step 2); тег `v2.1.0`; `main` влит в `redesign`.
- [x] Короткий отчёт владельцу в чат: ссылки на PR и деплой, результат пробы.

## Фаза 01 · Инструменты репетиции

- [x] Исполнить `plans/2026-10-14-rehearsal-tooling.md` (Tasks 0–5).
- [x] Протокол этапа, шаги 7–10 (ниже).

---

## Протокол этапа (для этапов 02a–13)

Каждый этап проходит одни и те же 10 шагов. Детали этапа — в плане 3.0, спеке 3.0, спецификации интерфейса 0.9.1, `SCREENS.md` и дополнениях к этапу ниже.

- [ ] **1. Готовность.** Зависимости этапа влиты в `redesign` (таблица этапов). Открыто не больше одной другой экранной ветки.
- [ ] **2. Worktree.**

```bash
cd /Users/felstell/git/-bloodbowlyerevan && git fetch origin
git worktree add ../bb-rd-NN -b rd/NN-name origin/redesign
cd ../bb-rd-NN
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/redesign)" && echo "base ok"
npm install && npm run build && npm test && npm run check && npm run i18n:check   # build first: tests read the generated public/data.*.json
```

Нет `base ok` → `git reset --hard origin/redesign` и повторить; не начинать на чужой базе.

- [ ] **3. Детальный план этапа** (skill writing-plans) → `docs/superpowers/plans/2026-10-14-rd-NN-name.md` в этой же ветке: задачи с тестами и кодом, Global Constraints этого мастер-плана плюс правила `README.md` handoff, Review Focus этапа. Пункты этапа из плана 3.0 и дополнения ниже — обязательный охват (самопроверка плана сверяет).
- [ ] **4. Исполнение** (skill subagent-driven-development): по задаче — исполнитель (TDD), ревьюер соответствия, ревьюер качества; замечания исправляются до следующей задачи.
- [ ] **5. Стоп-условия** (спека выката §2.3): продуктовое решение вне спек, противоречие прототипов, расхождение контента и кода → вопрос владельцу в чат; трек ждёт, другой продолжает.
- [ ] **6. Скриншоты** встроенным браузером (`preview_start`): каждый экран этапа на 390 и 1440, светлая и одна тёмная палитра, все состояния из `SCREENS.md`; выборочно 768 и 1024. Файлы — в `output/screens/rd-NN/` (не коммитятся), в PR — загрузкой.
- [ ] **7. Финальное ревью ветки** (skill requesting-code-review) и исправления.
- [ ] **8. Проверки перед PR:**

```bash
npm test && npm run check && npm run i18n:check && npm run build
npm run smoke   # + smoke:pre-match / smoke:friendly / smoke:post-match для 02b, 03, 07a, 09a–09c, 12
git diff --name-only origin/redesign -- src | xargs grep -nE ">[A-ZА-Я]" || true   # хардкод в разметке (CLAUDE.md)
python3 -c "import json,sys
for f in ('src/i18n/en.json','src/i18n/ru.json'):
    seen=set()
    def hook(pairs):
        for k,_ in pairs:
            assert k not in seen, f'duplicate key {k} in {f}'; seen.add(k)
        return dict(pairs)
    json.load(open(f,encoding='utf-8'),object_pairs_hook=hook)
print('i18n keys unique')"
shasum -a 256 server/db/migrations/*.sql   # сверить с отчётом последней репетиции, если миграции уже репетировались
```

Плюс `docs/redesign/handoff-0.9.1/PR-CHECKLIST.md` целиком.

- [ ] **9. PR и слияние.**

```bash
git push -u origin rd/NN-name
gh pr create --base redesign --head rd/NN-name --title "rd/NN: <что>" --body-file <scratchpad>/pr-rd-NN.md
gh pr merge <номер> --merge
```

Тело PR: пункты плана 3.0, закрытые этапом; вывод шага 8; скриншоты; расхождения макета с кодом и как решены; правки спек в этом PR; строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **10. После слияния.** Чекбоксы этапа в плане 3.0 и в таблице этапов ниже (коммит в следующей ветке или прямым коммитом `docs(plan): …` в `redesign`); `git worktree remove ../bb-rd-NN`; вторая открытая ветка ребейзится на свежую `redesign` (`git rebase origin/redesign`, конфликты в словарях — объединение ключей, затем шаг 8 заново).

---

## Этапы 02a–13

| Этап | Ветка | Зависит от | Пункты плана 3.0 | Smoke |
|---|---|---|---|---|
| [x] 02a | `rd/02a-data` | 01 | 2.1–2.5, 2.7 | `smoke`, `smoke:post-match` |
| [x] 02b | `rd/02b-match-events` | 02a | 2.6 | все четыре |
| [ ] 03 | `rd/03-api` | 02b | этап 3 | все четыре |
| [x] 04 | `rd/04-tokens` | 01 (параллельно с 02a–03) | этап 4 | `smoke` |
| [ ] 05 | `rd/05-shell` | 04, 03 | этап 5 | `smoke` |
| [ ] **M1** | — | 03, 05 | репетиция №1 | — |
| [ ] 06 | `rd/06-teams` | M1 | этап 6 | `smoke` |
| [ ] 11 | `rd/11-ref` | M1 (параллельно с 06) | этап 11 | `smoke` |
| [ ] 07a–07e | `rd/07a-roster-table` … `rd/07e-career` | 06 | этап 7 | `smoke`, `smoke:post-match` |
| [ ] 08 | `rd/08-treasury` | 06 (параллельно с 07) | этап 8 | `smoke` |
| [ ] **M2** | — | 07e, 08, 11 | вид и данные | — |
| [ ] 09a | `rd/09a-matches-prep` | M2 | этап 9: табло, перед матчем, подготовка, игра, удаление формы быстрого счёта | все четыре |
| [ ] 09b | `rd/09b-post-match` | 09a | этап 9: итоги по шагам, павшие из итогов; `rehearsal:transitions` | все четыре |
| [ ] 09c | `rd/09c-challenges` | 09b | этап 9: вызовы | `smoke:friendly` |
| [ ] 10 | `rd/10-season` | 09a (параллельно с 09b/09c) | этап 10 | `smoke` |
| [ ] **M3** | — | 09c, 10 | репетиция №2, полный матч | — |
| [ ] 12 | `rd/12-admin` | M3 | этап 12 | все четыре |
| [ ] **M4** | — | 12 | репетиция №3 | — |
| [ ] 13 | `rd/13-release` | M4 | этап 13 | все четыре |
| [ ] **M5** | — | 13 | финальная репетиция, go / no-go | — |

### Дополнения к этапам (обязательный охват детального плана)

**02a.**
- `009_team_stage.sql` — после `ADD COLUMN stage … DEFAULT 'active'` и `activated_at`:

```sql
UPDATE saved_teams t SET stage = 'draft'
WHERE NOT EXISTS (
        SELECT 1 FROM season_entries e JOIN seasons s ON s.id = e.season_id
        WHERE e.saved_team_id = t.id AND e.withdrawn_at IS NULL AND s.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM match_post_applications a WHERE a.saved_team_id = t.id)
  AND NOT EXISTS (
        SELECT 1 FROM season_pairings p
        LEFT JOIN season_entries he ON he.id = p.home_entry_id
        LEFT JOIN season_entries ae ON ae.id = p.away_entry_id
        WHERE p.result_status = 'confirmed'
          AND t.id IN (he.saved_team_id, ae.saved_team_id, p.friendly_home_team_id, p.friendly_away_team_id));
```

  То же правило читает `scripts/rehearsal/snapshot.mjs` (`stages`) — при изменении менять оба места.
- `015_backfill_fallen_players.sql` — перенос погибших (спека 3.0 §3.3). Первым шагом детального плана — найти в `src/domain/post-match/state.mjs` и `roster.mjs`, где в `match_post_games.state` лежат травмы стороны (код `dead`) и как они связаны с id игрока; тесты: игрок с `dead` в одной стороне переносится один раз, повторный прогон ничего не добавляет, игрок с другой травмой не переносится, journeyman/star из снимка — не переносится (их нет в `before_roster`).
- После 02a обновить `rehearsal:check`, если миграции добавили что-то, что стоит сравнивать.

**03.** Без техобслуживания (оно в 2.1.0). `POST /api/admin/teams/:id/fallen` — на этапе 12.
- Записи матча (из 02b). `POST /api/teams/:id/events` сначала берёт блокировки итогов — пару `FOR UPDATE OF p` (`loadPreparationFixture`), затем обе команды (`loadPreparationSources`) — и только потом пишет через `writeMatchEvents` (`server/season/match-events-store.mjs`): так тап упорядочен с разницей шага «Игроки» и с `finishPost`. `playerId` — только из снимка своей стороны (иначе `finishPost` учёл бы записи, которых блоб не получит); `counter = 'injury'` — только с `injury` `{code из INJURIES без none, stat для lasting}`, у остальных счётчиков `injury` нет. `MATCH_NOT_LIVE` (+ `API_ERRORS`, оба словаря): подготовка не `in_progress` или итоги `completed`. Решить, принимать ли тап стороны, уже сохранившей шаг «Игроки»: в 02b такой тап не попадает в её статистику, и разница при завершении его снимает. То же с итогами 2.x, ещё открытыми на 3.0: их сторона (без `followsEvents`) не следует за записями никогда, так что тап по ней тихо снимется разницей при завершении; решить, отказывает ли эндпоинт в тапе стороне с `followsEvents !== true` (после шага «Игроки» у стороны тоже не `true`; `reset-side` возвращает `true`). Генератор бросков на сервере — `(sides) => crypto.randomInt(1, sides + 1)` (случайный навык — d16).
- Записи матча, ещё из 02b. Писать только через `writeMatchEvents`: у `created_at` в 014 по умолчанию `now()` — время начала транзакции, а порядок (отмена травмы берёт последнюю такую же) держится на `clock_timestamp()`; строка со временем по умолчанию из транзакции, ждавшей блокировку пары, оказалась бы раньше уже зафиксированных строк. Конкурентность в `test/post-match-events-db.test.mjs` до тапов этапа 03 сделать принудительной, а не зависящей от `Promise.all`: держать `FOR UPDATE` пары на тестовом клиенте, опрашивать `pg_stat_activity`, пока два бэкенда не будут ждать на `Lock`, и только потом `COMMIT`. Автоповтор клиента при `POST_REVISION` (`src/data/post-match-client.mjs:12`) сравнивает стороны через `JSON.stringify`: у ответа, собранного в JS, и у GET из jsonb порядок ключей разный, и повтор сдаётся там, где мог бы пройти; перевести на `sameValues` из `src/domain/post-match/events.mjs`.
- Травмы в записях (из 02b): запись травмы хранит травму как введена; защита новичка (`effectiveInjury`, пока у команды сыграно меньше трёх матчей) может превратить её в Badly Hurt в ростере, так что история матча (03, 07e) обязана применять то же правило с `gamesPlayed` стороны, иначе покажет смерть, которой не было.
- Правка вне матча (спека 3.0 §3.7) — здесь целиком: `PATCH /api/teams/:id` пишет учтённые записи (`pairing_id NULL`, `settled_at` равен `created_at` строки) по разнице `player.spp` без MVP, в своей транзакции; во время матча — запись без пары и без `settled_at`; `finishPost` переносит неучтённые записи команды без пары в блоб и ставит им `settled_at` в своей транзакции. В 02b `finishPost` учитывает только записи своего матча, а `careerCounters` уже считает все неучтённые.
- Карьера и история — `careerCounters` и `statisticsFromEvents` из `src/domain/post-match/events.mjs`.

**04.** Шрифты уже в `assets/fonts/ui/` (2.1.0) — не копировать заново. `src/core/theme.mjs` и `theme-boot.js` пишут кеш `gata-league-palette` (JSON `{mode, light, dark}`) и переводят старые id через ту же таблицу, что `public/maintenance/palettes.mjs`; тест сравнивает `PALETTE_KEYS`, `DEFAULT_PALETTE` и `LEGACY_THEME_PALETTE` обоих модулей. При первом входе в 3.0 выбор записывается в `preferences`, если там пусто (спека выката §5.4).

**05.** Ключ `active-team` в `STORAGE_KEYS`; `gata-league-auth-token` и формат сессий не трогать (никто не должен перелогиниться). Кольцо фокуса — только из `src/ui/base.css` (`--accent-text`); токен `--focus-ring` (`box-shadow` на `--accent`, 2.68:1 на `--surface-2` в dungeon) не использовать, пока его не переведут на `--accent-text`.
- Из 03 (приоритет): `kindForStatus` в `src/core/api.mjs` относит 403 к 401, и `api-client.mjs` стирает токен: неверный `currentPassword` (403 `CURRENT_PASSWORD_WRONG`), `FIXTURE_NOT_YOURS`, `FALLEN_FROM_MATCH` и любой другой 403 разлогинивают браузер при живой сессии. В 3.0 мёртвую сессию значит только 401.
- Из 03: смена пароля — `PATCH /api/auth/profile` с `currentPassword` (403 `CURRENT_PASSWORD_WRONG`, 429 после лимита, остальные сессии закрываются); экран аккаунта шлёт `currentPassword` и показывает 429 с ожиданием (`Retry-After`, `retryAfterSeconds`). Настройки — `PATCH /api/auth/preferences` с изменёнными ключами → `{preferences}`; `preferences` есть только в `/api/auth/me`, и `scripts/mock-api.mjs` должен отдавать их там же; чужой или удалённый `activeTeamId` — 404 при записи и пропадает из `/me`.
- Детальный план этапа 05 (`2026-10-17-rd-05-shell.md`, ляжет в `rd/05-shell`) эти пункты уже содержит; строки здесь, чтобы их не потерять при его пересмотре.

**05–13: экраны на компонентах `src/ui` и остатки 2.x** (заметки этапа 04; остальное для 05 — в плане этапа 04, «Передача этапу 05»).
- Отказ степпера: `wireStepButtons` молча глотает нажатие на кнопку с `aria-disabled="true"`, а `title` на касание не показывается — экран вешает делегированный обработчик `[aria-disabled="true"]`, который показывает причину (как `src/screens/saved-roster.mjs`), или в `stepper.mjs` появляется хук `onRefused`.
- Первый экран с Sheet: фокус возвращается на открывшую кнопку после перерисовки, следующей за `onClose` (2.x `pre-match.mjs:91` делает это явно); нажатие внутри листа, отпущенное над подложкой, закрывает лист — листу с текстом правила нужна защита по `pointerdown`; прокрутка за листом не заблокирована — `html:has(dialog.g-sheet:modal) { overflow: hidden }` в оболочке.
- Радиогруппы (SegmentedControl, OptionList): после стрелки фокус стоит на пункте — не перерисовывать группу через `innerHTML` в `onChange`.
- Callout: кнопка действия не переносится (`nowrap`) — подписи действий короткие.
- `renderKpiGrid` бросает на нечётном и нулевом числе плиток: этап, который первым рисует плитки из данных (05 или 06), решает, что показать вместо дыры.
- Проверка словаря в `test/ui-kit.test.mjs` видит только `t("…")`: ключи из шаблонных строк (`` t(`stats.${stat}`) ``) проверять отдельно.
- Тесты `test/legacy-screens.test.mjs` уходят вместе с таблицей стилей 2.x, которую проверяют (06–12), остаток — с `legacy-aliases.css` на этапе 13.
- Оставшиеся taupe/olive-литералы 2.x (разделитель `.player-stat-editor` в `roster.css:1527`, рамка `.season-status-pill[data-status="started"]`), литералы `border-radius: 0`, лишний `color` в `site-matchday.css:114`, пустое `.league-hero-copy p` в `pages.css` и мёртвое `.badge.warning` в `catalog.css` уходят вместе со своими таблицами.

**M1.** Из 03: отчёт репетиции считает составы дампа прода с повторяющимися id игроков и со счётчиками SPP вне целых 0…999 (такие команды 03 отклонит при следующем сохранении, пока админ не поправит состав) и проходит маршрутом `GET …/players/:pid/history` по каждой команде и игроку дампа: везде 200, ни одного 500.

**06.** `builder-draft` удаляется вместе с ключом из `STORAGE_KEYS`; импорт старого черновика не делаем.

**07a–07e.**
- Карточка игрока: улучшенная характеристика в StatStrip выделена только цветом (WCAG 1.4.1) — показать её текстом или добавить sr-only ключ `ui.*`.
- До первого компонента с `<table>` в `src/ui` (RosterTable): fake-dom принимает `<p><div>` и `<table><tr>` без `<tbody>` как написано, а браузер строит другое дерево — сделать это ошибкой разбора.
- 07e (из 02b): `careerCounters` — предпросмотр, а не итог. «Учтено» (`settled_at`) значит «статистику применили завершённые итоги», а не «каждая запись стала SPP»: технический результат считает только MVP, проигравший с отказом и звёзды — ничего, молитвы добавляют бонус, которого никто не тапал. Поэтому карьера может измениться при завершении матча (вверх и вниз) и в живом матче стоять ниже значения ростера: лишний −1 без своего тапа вычитается из блоба. Выбрать: зажимать сумму каждого матча на 0 или показывать «ждёт итогов» отдельно; блоб и записи читать одним снимком, иначе завершение между двумя чтениями посчитает матч дважды или ни разу. История травм — по `effectiveInjury` (заметка этапа 03).
- 07d: `renderOptionCard` сам по себе — `role="radio"` без группы и без roving tabindex, а `wireOptionLists` слышит только карточки внутри `.g-options`: в описании сказать, что группе нужны `role="radiogroup"` и `wireRadioGroups`.
- Из 03: тапы — `POST /api/teams/:id/events {pairingId, playerId, counter, delta, injury?}`; «Правка вне матча» — тот же POST без `pairingId` (только во время матча); `EVENT_SIDE_LOCKED` у стороны, сохранившей «Игроки», и у итогов 2.x — показать «измените на шаге «Игроки»». Кнопку −1 не предлагать у счётчика на нуле (`EVENT_BELOW_ZERO`). Поля SPP принимают целые от 0 до 999 (`SPP_OUT_OF_RANGE` иначе); нарушения называют игрока и подпись счётчика (`SPP_OUT_OF_RANGE {player, counter}`, `DUPLICATE_PLAYER_ID {names}`).
- Из 03: редактор состава сохраняет SPP блоба из GET, не `careerCounters`, а ждущие записи показывает сверху; во время матча он не опускает SPP ниже ждущих правок вне матча (иначе итоги удержат счётчик на нуле, и история разойдётся с блобом).
- Из 03, 07b: `GET`/`DELETE …/fallen`; отмену не показывать при `fromMatch`.
- Из 03, 07d: `POST …/rolls` возвращает тот же бросок, пока он не использован; прокачка — `roll: {id, via: "site"}`; отмена прокачки освобождает бросок. Тип прокачки объявляют до броска (`DICE_ROLL_WAITING`, пока ждёт бросок другого типа), отмена прокачек с сайта идёт с последней к первой по игроку, какого бы типа они ни были (иначе `DICE_ROLL_USED`). Отменённую прокачку с сайта игрок должен взять снова, прежде чем получит следующий бросок: до тех пор запрос другого типа отвечает `DICE_ROLL_WAITING` с её типом, и экран говорит, какую прокачку взять. Бросок случайного навыка с `stale: true` взять нельзя: тренер убирает дубль навыка или берёт прокачку за столом, экран говорит почему. Маршрута для чтения попыток соперником нет — решить здесь.
- Из 03, 07e: `GET …/players/:pid/history` → `{history: {playerId, matches, outside}}`; `pending` читать как «ждёт итогов»; у `source: "none"` нули не рисовать (`counters: null`); у оставленного journeyman история начинается заново под новым id; MVP, правленный руками, строки не имеет. `GET …/events` отдаёт `revision` — сверять с блобом.

**08.** Счётчик ресурсов (Start Re-rolls, Team Re-rolls) отключает «+» у Start Re-rolls для команд в `active` и у Team Re-rolls для команд в `draft` и показывает переведённую причину (по смыслу `error.STAGE_PURCHASE_LOCKED`). С 02a `PATCH /api/teams/:id` отвечает 422 `STAGE_PURCHASE_LOCKED`, а включённый «+» старого редактора 2.x ломает все последующие автосохранения в этой сессии. Это должно попасть в `redesign` до того, как тренеры начнут пользоваться любой сборкой с редизайном.
- Из 03: `GET …/ledger` → `{entries, next, since}` (`since` — «История ведётся с …»); `POST …/treasury` → `{team, entry}`, 422 с `TREASURY_INVALID`, 409 с командой.

**11.** Таблицы справочника уже получают от сборки классы `fit-cell`, `center-cell`, `number-cell`, `fit-table` (`scripts/lib/render-table.mjs`, перенос из PR #9 на этапе 01). `fit-cell` и `center-cell` пока стилизованы глобальными правилами 2.x в `src/styles/roster.css`; этап 11 даёт всем четырём классам стили на токенах 3.0 (узкие колонки характеристик и бросков по центру, `Cost` вправо с `tabular-nums`, короткие таблицы во всю ширину без прокрутки) и убирает зависимость от `roster.css`.

**09a.** Форма быстрого счёта (`components/games/result-fields.mjs`, режим тренера) удаляется; админский ручной результат остаётся.

**09b.** `scripts/rehearsal-transitions.mjs` (`npm run rehearsal:transitions -- --seed <url 2.1> | --finish <url 3.0>`): `--seed` против сервера `v2.1.0` (worktree, порт 3004) на `gata_rehearsal` создаёт через API и записывает в `output/rehearsal/transitions.json` пять состояний из спеки выката §3.3; `--finish` против 3.0 доводит каждое до конца и проверяет: подготовка продолжается с того же шага; итоги, начатые в 2.x, завершаются без `POST_TEAM_CHANGED`, SPP после = SPP до + статистика матча, записи матча получают `settled_at`; неподтверждённый счёт вносит админ; вызов принимается. Детальный план этапа описывает API-вызовы по `scripts/smoke-post-match.mjs` и `smoke-friendly.mjs`.
- Из 02b: после смены результата и после `reset-side` статистика и травмы шага «Игроки» возвращаются из записей (сторона 2.x пересобирается уже с `followsEvents: true`, в 2.x вместо них были нули), а MVP, crowd/foul casualties, `retire` и уходы обнуляются; восстановленные TD/CAS могут не совпасть с новым счётом (`POST_STATISTICS`), интерфейс показывает расхождение. В `rehearsal:transitions` — настоящая строка итогов 2.x (не строка 3.0 со снятым флагом).
- Из 03: действие итогов `advance` не принимает `roll`; бросок на сайте в итогах — проверять `rollFitsAdvancement` и ставить `used_at` в транзакции итогов.
ActionStepper со значением и приростом читается «4+1» — где экран показывает прирост, добавить sr-only разделитель (заметка этапа 04).

**12.** Админка: «Добавить погибшего задним числом» (`POST /api/admin/teams/:id/fallen {player: {name, position, number?}, cause, pairingId?, diedAt?}`), ввод и подтверждение старых неподтверждённых счетов, перевод `draft → active`, `draft` для новых команд.
- Брошенный матч (из 02b): «админ может закрыть матч технически, тогда записи учитываются или удаляются» (спека 3.0 §3.7) — в плане 3.0 этого действия нет; без него записи брошенного матча навсегда остаются «ждёт итогов». Решение — у владельца. Из 03: правки вне матча, сделанные за время брошенного матча, остаются неучтёнными так же.
- Из 03: `POST /api/teams/:id/activate` готов. Казну, гибель и записи матча админ меняет только админским `PATCH` (`treasury`, `death`, `events` — маршруты владельца; отменить гибель может и админ); экран «Состав» в режиме админа расширяет маршруты. Форма пользователей не шлёт `password` для строки самого админа (409 `SELF_PASSWORD_RESET`): свой пароль админ меняет только в `#/settings`. `POST /api/admin/teams/:id/fallen` пишет в `player` полный снимок (`id`, `rowIndex`), иначе отмена такой гибели запишет в состав игрока, которого нормализация выбросит.
Заголовок «ADMINISTRATION» на 390 переносится посреди слова: «ADMINISTRATIO / N» (в 2.x было «ADMINISTRA / TION»); решить при переносе экранов админки (заметка этапа 04).

**13.**
- Удалить старые экраны, CSS, временные алиасы, Comfortaa и Nunito, `docs/redesign/handoff-0.9.1/`, `docs/redesign/reports/`; ужать бюджеты.
- Версия `3.0.0`, CHANGELOG, README, глоссарий.
- `DEPLOYMENT.md` → раздел «Moving to 3.0»: команды фазы X этого плана, переведённые в стиль файла (английский).

---

## Вехи

### Состав вехи

- [ ] **Репетиция** (M1, M3, M4, M5) — процедура ниже.
- [ ] **Отчёт** `docs/redesign/reports/Mn.md` (коммит в `redesign`):

```markdown
# Веха Mn — <дата>

## Сделано
- PR: <ссылки> — <одной строкой что>

## Посмотреть
- Скриншоты: <ссылки на PR со снимками>
- Поднять у себя: `git fetch && git switch redesign && npm install && npm start` (нужен `npm run postgres:up` и `npm run db:migrate`)

## Репетиция
- Дамп: <имя файла>, снят <дата>
- Миграции: <список>, <время> мс
- Существующие данные: OK / проблемы: <список>
- Стадии: active <N>, draft <M> — список в приложении ниже
- Погибшие перенесены: <по командам>
- Открытые состояния на момент дампа: <сводка>
- Откат на 2.1.0 на мигрированной базе: OK / нет
- Чек-суммы миграций: <sha256 по файлам>

## Нужно от вас
- <вопросы и решения>
```

- [ ] **Сообщение владельцу** в чат: короткая сводка и ссылка на отчёт. Дальше — только после его «ок».

### Процедура репетиции

1. **Владелец (сервер, `sudo -i`):**

```bash
cd /opt/bloodbowl-league && npm run backup:db
DUMP=$(ls -1t /var/backups/bloodbowl-league/gata_league-2*.dump | head -1); echo "$DUMP"
sha256sum "$DUMP"
install -m 600 -o ubuntu -g ubuntu "$DUMP" /home/ubuntu/
```

2. **Владелец (Mac):**

```bash
mkdir -p ~/gata-dumps && chmod 700 ~/gata-dumps
scp ubuntu@51.81.86.51:~/gata_league-YYYYMMDD-HHMMSS.dump ~/gata-dumps/
shasum -a 256 ~/gata-dumps/gata_league-YYYYMMDD-HHMMSS.dump   # совпадает с sha256sum на сервере
chmod 600 ~/gata-dumps/*.dump
```

3. **Владелец (сервер):** `rm /home/ubuntu/gata_league-YYYYMMDD-HHMMSS.dump`
4. **Claude (Mac, отдельный worktree на свежей `redesign`):**

```bash
cd /Users/felstell/git/-bloodbowlyerevan && git fetch origin
git worktree add --detach ../bb-rehearsal origin/redesign 2>/dev/null || (cd ../bb-rehearsal && git checkout --detach origin/redesign)
cd ../bb-rehearsal && npm install
npm run rehearsal:restore -- ~/gata-dumps/gata_league-YYYYMMDD-HHMMSS.dump
npm run rehearsal:check -- --before
npm run rehearsal:migrate
npm run rehearsal:check -- --after
```

затем сервер 3.0 на `gata_rehearsal` (`preview_start`, конфигурация с `DATABASE_URL` на `gata_rehearsal`) → все smoke → проход в браузере под 4–5 тренерами (спека выката §3.2) → с M3 полный товарищеский матч и `rehearsal:transitions` → сервер `v2.1.0` (worktree `../bb-v2.1.0`, `git worktree add --detach ../bb-v2.1.0 v2.1.0`, порт 3004, `DATABASE_URL` на `gata_rehearsal`) на той же базе: `/api/health` и `npm run smoke` с `SMOKE_BASE_URL=http://localhost:3004`.

5. **M5 дополнительно:** собранный сайт под боевым CSP. Локально, не коммитя, добавить в `writeResponse` (`server/http/responses.mjs`) заголовок `Content-Security-Policy` ровно из `deploy/caddy/bloodbowlyerevan.shitpostsoftware.com.conf`, пройти все экраны и состояния из `SCREENS.md`, `read_console_messages` — ноль нарушений CSP; затем `git checkout server/http/responses.mjs`.

---

## Фаза X · День X (runbook)

Все серверные команды — владелец под `sudo -i`; Claude в чате проверяет вывод каждого шага. Первой командой в сессии на сервере определить сокращение для запросов к базе:

```bash
DB() { docker exec -i gata-league-postgres psql -U gata_admin -d gata_league "$@"; }
```

### Подготовка

- [ ] **После «go» на M5:** владелец выбирает тихий вечер (тур может быть открыт); Claude готовит PR `redesign → main`:

```bash
git fetch origin && git switch redesign && git merge --no-ff origin/main && npm test && npm run check && npm run i18n:check && npm run build && git push
gh pr create --base main --head redesign --title "Gata League 3.0" --body-file <scratchpad>/pr-3.0.md
```

- [ ] **T−7 дней** — владелец публикует в Telegram лиги (текст готовит Claude): дата и окно до часа; «доделайте черновики в билдере»; «завершите итоги сыгранных матчей и подтвердите счета до <время>».
- [ ] **T−2 дня** — финальная репетиция (M5) на свежем дампе; PR `redesign → main` зелёный, без конфликтов.
- [ ] **T−1 день** — напоминание в Telegram; Claude присылает в чат этот runbook с подставленными датами.

### Окно

- [ ] **T−15 мин · предполётная проверка**

```bash
cd /opt/bloodbowl-league && npm run backup:status && df -h /var /opt
DB -c "
SELECT 'preparing' AS state, p.id, p.match_kind FROM season_pairings p
 WHERE p.preparation_status NOT IN ('not_started','in_progress') AND p.result_status IS DISTINCT FROM 'confirmed'
UNION ALL
SELECT 'started, post-match open', p.id, p.match_kind FROM season_pairings p
 WHERE p.preparation_status = 'in_progress'
   AND NOT EXISTS (SELECT 1 FROM match_post_applications a WHERE a.pairing_id = p.id)
   AND (EXISTS (SELECT 1 FROM match_post_games g WHERE g.pairing_id = p.id) OR p.result_status IS DISTINCT FROM 'confirmed')
UNION ALL
SELECT 'awaiting confirmation', p.id, p.match_kind FROM season_pairings p WHERE p.result_status = 'awaiting_confirmation';"
```

`awaiting confirmation` — договориться с соперником о подтверждении сейчас или внести счёт админом после переезда. `started, post-match open` — предупреждение при зелёном `rehearsal:transitions` на M5, иначе блокер (спека выката §6.2).

- [ ] **T+0 · техобслуживание**

```bash
npm run maintenance:on -- --kind planned --ends "$(date -u -d '+60 min' +%Y-%m-%dT%H:%M:%SZ)"
curl -s http://127.0.0.1:3002/api/health
```

С телефона: видна страница техобслуживания.

- [ ] **T+2 · дамп дня X и копия на Mac**

```bash
npm run backup:db
DUMP=$(ls -1t /var/backups/bloodbowl-league/gata_league-2*.dump | head -1); echo "$DUMP"; sha256sum "$DUMP"
install -m 600 -o ubuntu -g ubuntu "$DUMP" /home/ubuntu/
```

Mac: `scp …` и `shasum -a 256 …` как в процедуре репетиции; суммы совпадают. Сервер: `rm /home/ubuntu/<файл>`.

- [ ] **T+8 · слепок «до» и повтор открытых состояний**

```bash
DB -At -c "
SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(table_name), false, true, '')))[1]::text
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
SELECT 'teams=' || md5(string_agg(id || ':' || revision || ':' || md5(roster::text), ',' ORDER BY id)) FROM saved_teams;
SELECT 'pairings=' || md5(coalesce(string_agg(concat_ws('|', id, home_touchdowns, away_touchdowns, home_casualties, away_casualties,
  result_type, home_points, away_points, result_status, confirmed_at), ',' ORDER BY id), '')) FROM season_pairings;" > /root/cutover-before.txt
cat /root/cutover-before.txt
```

и ещё раз запрос открытых состояний из T−15 (ничего нового не появилось).

- [ ] **T+10 · владелец вливает PR `redesign → main`** (GitHub, merge commit). Claude следит за job Deploy: ожидается `deploy:migrate: pending: 009_…, …, 015_…`, `backup ok: …premigrate…`, `applied …`, `deployed and answering on port 3002`.

- [ ] **T+15 · проверка схемы и данных**

```bash
cd /opt/bloodbowl-league && git log --oneline -1 && npm run db:migrate -- --check
DB -At -c "<тот же запрос, что в T+8>" > /root/cutover-after.txt
diff /root/cutover-before.txt /root/cutover-after.txt
pm2 logs bloodbowl-league --lines 100 --nostream
```

Ожидается: `database is up to date`; в `diff` — только новые таблицы (`dice_rolls`, `match_events`, `team_fallen_players`, `team_ledger`) и `schema_migrations` (+7); строки `teams=` и `pairings=` совпадают; в логах нет ошибок.

- [ ] **T+20 · проверка через туннель** (Mac): `ssh -L 3002:127.0.0.1:3002 ubuntu@51.81.86.51`, затем `http://localhost:3002` — чек-лист спеки выката §6.5 (12 пунктов).

- [ ] **T+30 · решение.** Блокер → «Откат до точки невозврата» ниже. Иначе дальше.

- [ ] **T+35 · точка невозврата**

```bash
npm run maintenance:off
```

С телефона: «Готово» → сайт 3.0. Claude: `git tag -a v3.0.0 -m "Gata League 3.0" origin/main && git push origin v3.0.0` (после «ок» владельца). Владелец: объявление в Telegram.

- [ ] **T+35 … +3 ч · наблюдение:** `pm2 logs bloodbowl-league`, `/api/health`, сообщения тренеров. Хотфикс: ветка `hotfix/…` от `main` → PR → владелец вливает → деплой; Claude вливает `main` в `redesign` только если `redesign` ещё жива (после релиза её можно удалить).

### Откат до точки невозврата (сценарий 1)

```bash
cd /opt/bloodbowl-league && git fetch origin --tags
git reset --hard v2.1.0 && npm install && npm run build
pm2 restart bloodbowl-league
sleep 5 && curl -fsS http://127.0.0.1:3002/api/health
npm run maintenance:off
```

База не восстанавливается: 2.1.0 работает на мигрированной схеме (проверено репетициями). **После отката не пушить в `main`** — любой пуш снова выкатит 3.0. Повторная попытка: исправление → PR в `main` → деплой в следующем окне. Срочный фикс 2.1 до повторной попытки: ветка `hotfix/2.1.x` от `v2.1.0`, на сервер — `git fetch && git reset --hard origin/hotfix/2.1.x && npm install && npm run build && pm2 restart bloodbowl-league`.

### Полное восстановление (сценарий 3, только при катастрофе в первые часы)

Решение принимает владелец: всё, что записано после переезда, теряется.

```bash
npm run maintenance:on -- --kind unplanned
pm2 stop bloodbowl-league
DUMP=/var/backups/bloodbowl-league/<дамп дня X>.dump
docker cp "$DUMP" gata-league-postgres:/tmp/restore.dump
docker exec gata-league-postgres dropdb -U gata_admin --force gata_league
docker exec gata-league-postgres createdb -U gata_admin gata_league
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league /tmp/restore.dump
docker exec gata-league-postgres rm -f /tmp/restore.dump
git reset --hard v2.1.0 && npm install && npm run build
npm run db:migrate -- --check     # database is up to date (миграции 2.1.0 = миграции дампа)
pm2 start bloodbowl-league && sleep 5 && curl -fsS http://127.0.0.1:3002/api/health
npm run maintenance:off
```

Точечный ремонт (по умолчанию) — тот же дамп в `gata_league_recover` (`createdb … gata_league_recover`, `pg_restore -d gata_league_recover`), перенос пострадавших строк SQL-запросом, который Claude готовит под конкретную порчу.

### После

- [ ] **T+1 день:** `npm run backup:status` — OK, свежий ночной дамп снят на схеме 3.0.
- [ ] **T+14 дней:**

```bash
# Mac
rm -P ~/gata-dumps/*.dump
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_rehearsal
# сервер
ls /var/backups/bloodbowl-league/*premigrate*   # проверить список, затем
rm /var/backups/bloodbowl-league/gata_league-premigrate-*.dump
```

- [ ] В `DEPLOYMENT.md` записать дату переезда и фактическое время простоя (PR в `main`).

# Этап 01 · Инструменты репетиции и перенос из PR #9 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** дать команды, которые разворачивают боевой дамп в локальную обезличенную базу `gata_rehearsal` и доказывают, что миграции 3.0 не тронули ни одной существующей строки; заодно перенести в `redesign` полезную часть закрываемого PR #9.

**Architecture:** `npm run rehearsal:restore -- <дамп>` пересоздаёт `gata_rehearsal` в локальном docker-контейнере, восстанавливает дамп и в той же команде обезличивает его. `npm run rehearsal:check -- --before|--after` снимает слепок базы (`scripts/rehearsal/snapshot.mjs`) и сравнивает «до» и «после», записывая отчёт в `output/rehearsal/`. Обе команды работают только с локальной базой.

**Tech Stack:** Node.js (ES-модули, `node --test`), `pg`, Docker (`gata-league-postgres`), PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md` §3.1, §3.2, §3.4, §0.7. Мастер-план: `docs/superpowers/plans/2026-10-14-redesign-rollout.md`, фаза 01.

## Global Constraints

- Ветка `rd/01-rehearsal` от актуальной `redesign`, в которую уже влит релиз 2.1.0; PR в `redesign`; вливает Claude после проверок и ревью.
- Без новых зависимостей.
- Команды репетиции отказываются работать, если хост `DATABASE_URL` не `localhost`, `127.0.0.1` или `::1`.
- Обезличивание: `users.password_hash` → `hashPassword(REHEARSAL_PASSWORD)`, `users.telegram` → `@coach_N`, `sessions` очищается; логины, команды, составы, результаты остаются.
- В репозиторий не попадает ничего из дампа: отчёты и слепки — только в `output/` (в `.gitignore`).
- Бюджеты `scripts/check-budgets.json` (600 строк на файл, 80 на функцию, 0 недостижимых функций) только уменьшаются.
- Комментарии в коде — по-английски, в тоне соседних файлов.

## Review Focus

1. **`DATABASE_URL` указывает на сервер** (например, через SSH-туннель на `localhost`, но с именем боевой базы) → restore трогает только базу `gata_rehearsal`, никогда базу из `DATABASE_URL` (Task 2).
2. **`REHEARSAL_PASSWORD` не задан** → restore останавливается до `pg_restore`, а не оставляет базу с боевыми хэшами (Task 3).
3. **Обезличивание упало на середине** → откат транзакции и ненулевой код, а не база с частью настоящих Telegram-контактов (Task 2).
4. **Слепок «после» без слепка «до»** → понятная ошибка, а не «всё ок» (Task 5).
5. **Миграция добавила колонку в `saved_teams`** → сравнение не считает это изменением состава: сравниваются `roster` и `revision`, а не вся строка (Task 4).

---

### Task 0: Worktree и ветка

- [ ] **Step 1: Проверить, что 2.1.0 уже в `redesign`**

```bash
cd /Users/felstell/git/-bloodbowlyerevan
git fetch origin
git merge-base --is-ancestor origin/main origin/redesign && echo "main is in redesign"
git show origin/redesign:package.json | grep '"version"'   # ожидается "2.1.0"
```

- [ ] **Step 2: Создать worktree**

```bash
git worktree add ../bb-rd-01 -b rd/01-rehearsal origin/redesign
cd ../bb-rd-01
git log --oneline -1   # тот же коммит, что origin/redesign
npm install && npm run build && npm test && npm run check && npm run i18n:check   # build first: tests read the generated public/data.*.json
```

---

### Task 1: Перенос из PR #9 — таблицы справочника и заметка глоссария

Из PR #9 сохраняется только то, что не зависит от старого CSS: модуль `scripts/lib/render-table.mjs` (раскладка колонок таблиц справочника на этапе сборки), его тест и заметка в глоссарии. Стили для новых классов (`fit-cell`, `center-cell`, `number-cell`, `fit-table`) напишет этап 11 на токенах 3.0; без них таблицы выглядят как сейчас.

**Files:**
- Create: `scripts/lib/render-table.mjs`, `test/render-table.test.mjs`
- Modify: `scripts/build-data.mjs`, `docs/i18n-glossary.md`, `scripts/check-budgets.json`

- [ ] **Step 1: Взять файлы из ветки PR #9**

```bash
git checkout origin/imp/UI-update-p8v2 -- scripts/lib/render-table.mjs test/render-table.test.mjs scripts/build-data.mjs docs/i18n-glossary.md
git diff --cached --stat
```

Expected: 4 файла. `scripts/build-data.mjs` в `redesign` совпадает с `main`, на котором основан PR #9, поэтому в diff должна быть только замена рендера таблиц на `renderTable` — проверить `git diff --cached scripts/build-data.mjs`; если там есть что-то ещё, вернуть файл (`git checkout origin/redesign -- scripts/build-data.mjs`) и перенести только хунки из `gh pr diff 9 -- scripts/build-data.mjs` руками. Для `docs/i18n-glossary.md` diff должен содержать только раздел «Table headers that drive column layout».

- [ ] **Step 2: Тесты и сборка**

```bash
node --test test/render-table.test.mjs
npm run build && npm run i18n:check
```

Expected: PASS; одинаковое число страниц EN/RU, 0 fallback.

- [ ] **Step 3: Бюджет `scripts/build-data.mjs`**

Run: `wc -l scripts/build-data.mjs`
Записать результат в `scripts/check-budgets.json` → `structure.maxFileLines["scripts/build-data.mjs"]` (было 808). Остальные бюджеты не трогать.

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/render-table.mjs test/render-table.test.mjs scripts/build-data.mjs docs/i18n-glossary.md scripts/check-budgets.json
git commit -m "refactor(build): table layout from PR #9 — render-table module and glossary note"
```

- [ ] **Step 5: Закрыть PR #9 с комментарием**

```bash
gh pr close 9 --comment "Superseded by the 3.0 redesign (docs/superpowers/specs/2026-10-14-redesign-rollout-design.md §0.7). Carried over to \`redesign\` in rd/01-rehearsal: scripts/lib/render-table.mjs with its test and the glossary note on table headers. The CSS changes are not carried over: 3.0 replaces these stylesheets, and stage 11 styles the new table classes on the 3.0 tokens."
```

Ветку `imp/UI-update-p8v2` не удалять.

---

### Task 2: Защита от чужой базы и обезличивание

**Files:**
- Create: `scripts/rehearsal/guard.mjs`, `scripts/rehearsal/anonymize.mjs`
- Test: `test/rehearsal-guard.test.mjs`, `test/rehearsal-anonymize.test.mjs`

**Interfaces:**
- Produces:
  - `REHEARSAL_DATABASE = "gata_rehearsal"`
  - `assertLocalDatabaseUrl(url: string) → URL` (бросает на нелокальном хосте)
  - `rehearsalDatabaseUrl(url: string) → string` (тот же доступ, база `gata_rehearsal`)
  - `anonymizeRehearsalDatabase(client, password, hash = hashPassword) → Promise<{users: number, sessions: number}>`

- [ ] **Step 1: Падающие тесты**

`test/rehearsal-guard.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, rehearsalDatabaseUrl } from "../scripts/rehearsal/guard.mjs";

test("only a database on this machine is accepted", () => {
  for (const url of ["postgres://u:p@localhost:5433/gata_league", "postgres://u:p@127.0.0.1:5433/x", "postgres://u:p@[::1]:5433/x"]) {
    assert.doesNotThrow(() => assertLocalDatabaseUrl(url), url);
  }
  for (const url of ["postgres://u:p@51.81.86.51:5432/gata_league", "postgres://u:p@db.example.com/x", "not a url"]) {
    assert.throws(() => assertLocalDatabaseUrl(url), /local/, url);
  }
});

test("the rehearsal database keeps the credentials and swaps only the name", () => {
  const url = new URL(rehearsalDatabaseUrl("postgres://gata_admin:secret@localhost:5433/gata_league?sslmode=disable"));
  assert.equal(url.pathname, `/${REHEARSAL_DATABASE}`);
  assert.equal(url.username, "gata_admin");
  assert.equal(url.password, "secret");
  assert.equal(url.port, "5433");
  assert.equal(url.searchParams.get("sslmode"), "disable");
});
```

`test/rehearsal-anonymize.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { anonymizeRehearsalDatabase } from "../scripts/rehearsal/anonymize.mjs";
import { verifyPassword } from "../server/auth/session.mjs";

function recordingClient({ failOn } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql: sql.trim().split(/\s+/).slice(0, 2).join(" "), params });
      if (failOn && sql.includes(failOn)) throw new Error("boom");
      return { rowCount: sql.startsWith("UPDATE") ? 12 : sql.startsWith("DELETE") ? 30 : 0 };
    },
  };
}

test("passwords, contacts and sessions are replaced in one transaction", async () => {
  const client = recordingClient();
  const result = await anonymizeRehearsalDatabase(client, "rehearse-1");
  assert.deepEqual(result, { users: 12, sessions: 30 });
  assert.deepEqual(client.statements.map((statement) => statement.sql), ["BEGIN", "UPDATE users", "DELETE FROM", "COMMIT"]);
  assert.ok(verifyPassword("rehearse-1", client.statements[1].params[0]));
});

test("a failure rolls everything back and is reported", async () => {
  const client = recordingClient({ failOn: "DELETE" });
  await assert.rejects(() => anonymizeRehearsalDatabase(client, "rehearse-1"), /boom/);
  assert.equal(client.statements.at(-1).sql, "ROLLBACK");
});

test("an empty password is refused before anything runs", async () => {
  const client = recordingClient();
  await assert.rejects(() => anonymizeRehearsalDatabase(client, ""), /REHEARSAL_PASSWORD/);
  assert.equal(client.statements.length, 0);
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `node --test test/rehearsal-guard.test.mjs test/rehearsal-anonymize.test.mjs`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Защита**

`scripts/rehearsal/guard.mjs`:

```js
/**
 * Rehearsals only ever touch a database on this machine, and only one name.
 *
 * A rehearsal restores the production dump, then migrates and pokes at it.
 * Pointed at the real server — a tunnel, a stale DATABASE_URL — any of that
 * would be the incident the rehearsal exists to prevent. So the host must be
 * local, and the database is always gata_rehearsal whatever DATABASE_URL names.
 */
export const REHEARSAL_DATABASE = "gata_rehearsal";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function assertLocalDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("rehearsal: DATABASE_URL is not a URL; it must name a local database");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`rehearsal: refusing ${url.hostname}; rehearsals run against a local database only`);
  }
  return url;
}

export function rehearsalDatabaseUrl(value) {
  const url = assertLocalDatabaseUrl(value);
  url.pathname = `/${REHEARSAL_DATABASE}`;
  return url.toString();
}
```

- [ ] **Step 4: Обезличивание**

`scripts/rehearsal/anonymize.mjs`:

```js
/**
 * Strip a restored production dump of what is private before anyone uses it.
 *
 * What goes: password hashes (every account gets the rehearsal password, so
 * a rehearsal can sign in as any coach), Telegram contacts, and sessions.
 * What stays: logins, teams, rosters and results — the league already shows
 * those to anybody on the public site, and they are what a rehearsal tests.
 *
 * One transaction: a half-anonymized database is worse than none.
 */
import { hashPassword } from "../../server/auth/session.mjs";

export async function anonymizeRehearsalDatabase(client, password, hash = hashPassword) {
  if (!password) throw new Error("rehearsal: set REHEARSAL_PASSWORD in .env before restoring a dump");
  await client.query("BEGIN");
  try {
    const users = await client.query(
      `UPDATE users SET password_hash = $1, telegram = '@coach_' || ranked.position
       FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position FROM users) AS ranked
       WHERE users.id = ranked.id`,
      [hash(password)],
    );
    const sessions = await client.query("DELETE FROM sessions");
    await client.query("COMMIT");
    return { users: users.rowCount, sessions: sessions.rowCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
```

- [ ] **Step 5: Тесты**

Run: `node --test test/rehearsal-guard.test.mjs test/rehearsal-anonymize.test.mjs`
Expected: PASS (5 тестов).

- [ ] **Step 6: Commit**

```bash
git add scripts/rehearsal/guard.mjs scripts/rehearsal/anonymize.mjs test/rehearsal-guard.test.mjs test/rehearsal-anonymize.test.mjs
git commit -m "feat(rehearsal): local-only guard and anonymization of a restored dump"
```

---

### Task 3: `npm run rehearsal:restore`

**Files:**
- Create: `scripts/rehearsal-restore.mjs`
- Modify: `package.json` (`scripts`), `.env.example`

**Interfaces:**
- Consumes: `REHEARSAL_DATABASE`, `assertLocalDatabaseUrl`, `rehearsalDatabaseUrl`, `anonymizeRehearsalDatabase` (Task 2); `loadEnvFile`.
- Produces: `npm run rehearsal:restore -- <путь к .dump>`; печатает `DATABASE_URL` репетиционной базы.

- [ ] **Step 1: Команда**

`scripts/rehearsal-restore.mjs`:

```js
#!/usr/bin/env node
/**
 * Restore a production dump into the local gata_rehearsal database, anonymized.
 *
 *   npm run rehearsal:restore -- ~/gata-dumps/gata_league-20261102-150000.dump
 *
 * Drops and recreates gata_rehearsal in the local Postgres container, restores
 * the dump without its owners and grants (the local role differs from the
 * server's), then anonymizes it in the same run (scripts/rehearsal/anonymize.mjs).
 * Never touches the database DATABASE_URL names — only gata_rehearsal beside it.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { anonymizeRehearsalDatabase } from "./rehearsal/anonymize.mjs";
import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

const container = process.env.POSTGRES_CONTAINER || "gata-league-postgres";
const inside = "/tmp/rehearsal.dump";

function docker(...args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`docker ${args.slice(0, 3).join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

async function main() {
  const dump = process.argv[2];
  if (!dump || !existsSync(dump)) throw new Error("usage: npm run rehearsal:restore -- <path to a .dump file>");
  const password = process.env.REHEARSAL_PASSWORD;
  if (!password) throw new Error("set REHEARSAL_PASSWORD in .env before restoring a dump");
  const source = assertLocalDatabaseUrl(process.env.DATABASE_URL);
  const user = decodeURIComponent(source.username) || process.env.POSTGRES_USER;
  const target = rehearsalDatabaseUrl(process.env.DATABASE_URL);

  docker("exec", container, "dropdb", "--if-exists", "--force", "-U", user, REHEARSAL_DATABASE);
  docker("exec", container, "createdb", "-U", user, REHEARSAL_DATABASE);
  docker("cp", path.resolve(dump), `${container}:${inside}`);
  try {
    docker("exec", container, "pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "-U", user, "-d", REHEARSAL_DATABASE, inside);
  } finally {
    docker("exec", container, "rm", "-f", inside);
  }

  const client = new pg.Client({ connectionString: target });
  await client.connect();
  try {
    const { users, sessions } = await anonymizeRehearsalDatabase(client, password);
    console.log(`rehearsal: restored ${path.basename(dump)} into ${REHEARSAL_DATABASE}; anonymized ${users} users, removed ${sessions} sessions`);
  } finally {
    await client.end();
  }
  const shown = new URL(target);
  shown.password = "****";
  console.log(`rehearsal: use DATABASE_URL=${shown} (password as in your .env)`);
}

main().catch((error) => {
  console.error(`rehearsal:restore: ${error.message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 2: npm-скрипт и `.env.example`**

`package.json` → `scripts`, после `"maintenance:status": …`:

```json
    "rehearsal:restore": "node scripts/rehearsal-restore.mjs",
    "rehearsal:check": "node scripts/rehearsal-check.mjs"
```

(`rehearsal-check.mjs` появится в Task 5; до него `npm run rehearsal:check` не вызывать.)

В конец `.env.example`:

```text

# Rehearsals (npm run rehearsal:restore): every account in a restored dump gets
# this password, so a rehearsal can sign in as any coach. Local only.
# REHEARSAL_PASSWORD=
```

- [ ] **Step 3: Прогон на локальном дампе**

В локальном `.env` задать `REHEARSAL_PASSWORD` (любое значение; в чат не выводить).

```bash
npm run postgres:up && npm run db:migrate
BACKUP_DIR="$PWD/output/backups" npm run backup:db
DUMP=$(ls -1t output/backups/gata_league-*.dump | head -1)
npm run rehearsal:restore -- "$DUMP"
docker exec gata-league-postgres psql -U gata_admin -d gata_rehearsal -tc "SELECT count(*) FROM users WHERE telegram NOT LIKE '@coach_%'"
```

Expected: restore печатает `restored … anonymized N users`; последняя команда печатает `0`. Повторный запуск restore проходит так же (база пересоздаётся).

- [ ] **Step 4: Commit**

```bash
git add scripts/rehearsal-restore.mjs package.json .env.example
git commit -m "feat(rehearsal): rehearsal:restore — a production dump as a local anonymized database"
```

---

### Task 4: Слепок базы и сравнение «до / после»

**Files:**
- Create: `scripts/rehearsal/snapshot.mjs`
- Test: `test/rehearsal-snapshot.test.mjs`

**Interfaces:**
- Produces:
  - `takeSnapshot(client) → Promise<Snapshot>`, где `Snapshot = {takenAt, migrations: string[], tables: Record<string, number>, teams: Record<id, {name, revision, roster}>, season: {pairings, entries}, open: {preparing: Row[], startedWithoutPost: Row[], awaitingConfirmation: Row[], pendingChallenges: number}, stages: StageRow[]|null, preferencesSet: number|null, fallen: Record<teamId, number>|null}`
  - `compareSnapshots(before, after) → {problems: string[], notes: string[]}`
  - `renderReport(before, after, comparison) → string` (Markdown)

- [ ] **Step 1: Падающие тесты на сравнение**

`test/rehearsal-snapshot.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { compareSnapshots, renderReport } from "../scripts/rehearsal/snapshot.mjs";

function snapshot(overrides = {}) {
  return {
    takenAt: "2026-11-01T10:00:00.000Z",
    migrations: ["001_baseline.sql", "008_withdraw_season_entries.sql"],
    tables: { users: 12, saved_teams: 20, season_pairings: 70 },
    teams: { t1: { name: "Ashgrove Wardens", revision: 14, roster: "aaa" }, t2: { name: "Silverbrook Rangers", revision: 3, roster: "bbb" } },
    season: { pairings: "p-hash", entries: "e-hash" },
    open: { preparing: [], startedWithoutPost: [], awaitingConfirmation: [], pendingChallenges: 0 },
    stages: null,
    preferencesSet: null,
    fallen: null,
    ...overrides,
  };
}

test("an untouched database compares clean", () => {
  assert.deepEqual(compareSnapshots(snapshot(), snapshot()).problems, []);
});

test("new tables and migrations are notes, not problems", () => {
  const after = snapshot({ migrations: [...snapshot().migrations, "009_team_stage.sql"], tables: { ...snapshot().tables, team_ledger: 0 } });
  const result = compareSnapshots(snapshot(), after);
  assert.deepEqual(result.problems, []);
  assert.ok(result.notes.some((note) => note.includes("009_team_stage.sql")));
  assert.ok(result.notes.some((note) => note.includes("team_ledger")));
});

test("a changed roster, revision, row count or season result is a problem", () => {
  const teams = { ...snapshot().teams, t1: { ...snapshot().teams.t1, roster: "zzz" }, t2: { ...snapshot().teams.t2, revision: 4 } };
  const after = snapshot({ teams, tables: { ...snapshot().tables, users: 11 }, season: { pairings: "other", entries: "e-hash" } });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.some((problem) => problem.includes("Ashgrove Wardens") && problem.includes("roster")));
  assert.ok(problems.some((problem) => problem.includes("Silverbrook Rangers") && problem.includes("revision")));
  assert.ok(problems.some((problem) => problem.includes("users") && problem.includes("12") && problem.includes("11")));
  assert.ok(problems.some((problem) => problem.includes("season_pairings")));
});

test("a missing team or table is a problem", () => {
  const { t2, ...teams } = snapshot().teams;
  const { saved_teams, ...tables } = snapshot().tables;
  const { problems } = compareSnapshots(snapshot(), snapshot({ teams, tables }));
  assert.ok(problems.some((problem) => problem.includes("Silverbrook Rangers")));
  assert.ok(problems.some((problem) => problem.includes("saved_teams")));
});

test("a stage outside draft and active, or preferences already set, is a problem", () => {
  const after = snapshot({
    stages: [{ id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: true }, { id: "t2", name: "Silverbrook Rangers", stage: "retired", entered: false, playedMatch: false }],
    preferencesSet: 2,
  });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.some((problem) => problem.includes("retired")));
  assert.ok(problems.some((problem) => problem.includes("preferences")));
});

test("the report lists stages with reasons, fallen players and open states", () => {
  const after = snapshot({
    stages: [{ id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: false }, { id: "t2", name: "Silverbrook Rangers", stage: "draft", entered: false, playedMatch: false }],
    fallen: { t1: 2 },
    open: { preparing: [{ id: "p1", matchKind: "league" }], startedWithoutPost: [], awaitingConfirmation: [{ id: "p2", matchKind: "friendly" }], pendingChallenges: 1 },
  });
  const report = renderReport(snapshot(), after, compareSnapshots(snapshot(), after));
  assert.match(report, /Ashgrove Wardens.*active.*entered/);
  assert.match(report, /Silverbrook Rangers.*draft/);
  assert.match(report, /Ashgrove Wardens.*2/);
  assert.match(report, /p2/);
  assert.match(report, /\*\*OK\*\*/);
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `node --test test/rehearsal-snapshot.test.mjs`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`scripts/rehearsal/snapshot.mjs`:

```js
/**
 * What a rehearsal proves: the 3.0 migrations added and changed nothing else.
 *
 * A snapshot is taken before and after migrating. Existing data is compared by
 * what it means rather than by whole rows: a migration adds columns to
 * saved_teams, so a team is its roster's hash and its revision, and the season
 * is a hash of its results. Row counts catch anything deleted. What a migration
 * should have produced (stages, fallen players, empty preferences) and what is
 * still open (a match half-way through) go in the report for a person to read.
 */
const LIST = (rows) => rows.map((row) => ({ id: row.id, matchKind: row.match_kind }));

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
    [table, column],
  );
  return rows.length > 0;
}

async function tableCounts(client) {
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const counts = {};
  for (const { table_name: name } of rows) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    counts[name] = (await client.query(`SELECT count(*)::int AS n FROM ${quoted}`)).rows[0].n;
  }
  return counts;
}

async function seasonHashes(client) {
  const pairings = await client.query(`
    SELECT md5(coalesce(string_agg(concat_ws('|', id, home_touchdowns, away_touchdowns, home_casualties, away_casualties,
      result_type, home_points, away_points, result_status, confirmed_at), ',' ORDER BY id), '')) AS hash FROM season_pairings`);
  const entries = await client.query(`
    SELECT md5(coalesce(string_agg(concat_ws('|', id, season_id, user_id, saved_team_id, withdrawn_at), ',' ORDER BY id), '')) AS hash FROM season_entries`);
  return { pairings: pairings.rows[0].hash, entries: entries.rows[0].hash };
}

async function openStates(client) {
  const applied = "EXISTS (SELECT 1 FROM match_post_applications a WHERE a.pairing_id = p.id)";
  const preparing = await client.query(`SELECT p.id, p.match_kind FROM season_pairings p
    WHERE p.preparation_status NOT IN ('not_started', 'in_progress') AND p.result_status IS DISTINCT FROM 'confirmed' ORDER BY p.id`);
  // Started and not applied, and either a post-match draft exists or the result
  // is still open: an old match whose score was confirmed the quick way, with no
  // post-match ever begun, is history rather than a match in flight.
  const started = await client.query(`SELECT p.id, p.match_kind FROM season_pairings p
    WHERE p.preparation_status = 'in_progress' AND NOT ${applied}
      AND (EXISTS (SELECT 1 FROM match_post_games g WHERE g.pairing_id = p.id) OR p.result_status IS DISTINCT FROM 'confirmed')
    ORDER BY p.id`);
  const awaiting = await client.query(`SELECT p.id, p.match_kind FROM season_pairings p
    WHERE p.result_status = 'awaiting_confirmation' ORDER BY p.id`);
  const challenges = await client.query("SELECT count(*)::int AS n FROM friendly_challenges WHERE status = 'pending'");
  return {
    preparing: LIST(preparing.rows),
    startedWithoutPost: LIST(started.rows),
    awaitingConfirmation: LIST(awaiting.rows),
    pendingChallenges: challenges.rows[0].n,
  };
}

async function stages(client) {
  if (!(await columnExists(client, "saved_teams", "stage"))) return null;
  const { rows } = await client.query(`
    SELECT t.id, t.name, t.stage,
      EXISTS (SELECT 1 FROM season_entries e JOIN seasons s ON s.id = e.season_id
              WHERE e.saved_team_id = t.id AND e.withdrawn_at IS NULL AND s.status = 'active') AS entered,
      (EXISTS (SELECT 1 FROM match_post_applications a WHERE a.saved_team_id = t.id)
       OR EXISTS (SELECT 1 FROM season_pairings p
                  LEFT JOIN season_entries he ON he.id = p.home_entry_id
                  LEFT JOIN season_entries ae ON ae.id = p.away_entry_id
                  WHERE p.result_status = 'confirmed'
                    AND t.id IN (he.saved_team_id, ae.saved_team_id, p.friendly_home_team_id, p.friendly_away_team_id))) AS played_match
    FROM saved_teams t ORDER BY t.stage, t.name`);
  return rows.map((row) => ({ id: row.id, name: row.name, stage: row.stage, entered: row.entered, playedMatch: row.played_match }));
}

export async function takeSnapshot(client) {
  const teams = {};
  for (const row of (await client.query("SELECT id, name, revision, md5(roster::text) AS roster FROM saved_teams ORDER BY id")).rows) {
    teams[row.id] = { name: row.name, revision: Number(row.revision), roster: row.roster };
  }
  const fallenExists = (await client.query("SELECT to_regclass('public.team_fallen_players') IS NOT NULL AS ok")).rows[0].ok;
  const fallen = fallenExists
    ? Object.fromEntries((await client.query("SELECT saved_team_id, count(*)::int AS n FROM team_fallen_players GROUP BY 1")).rows.map((row) => [row.saved_team_id, row.n]))
    : null;
  return {
    takenAt: new Date().toISOString(),
    migrations: (await client.query("SELECT name FROM schema_migrations ORDER BY name")).rows.map((row) => row.name),
    tables: await tableCounts(client),
    teams,
    season: await seasonHashes(client),
    open: await openStates(client),
    stages: await stages(client),
    preferencesSet: (await columnExists(client, "users", "preferences"))
      ? (await client.query("SELECT count(*)::int AS n FROM users WHERE preferences <> '{}'::jsonb")).rows[0].n
      : null,
    fallen,
  };
}

function compareTables(before, after, problems, notes) {
  for (const [name, count] of Object.entries(before.tables)) {
    if (!(name in after.tables)) problems.push(`table ${name} is gone`);
    else if (after.tables[name] !== count) problems.push(`table ${name}: ${count} rows before, ${after.tables[name]} after`);
  }
  for (const name of Object.keys(after.tables)) {
    if (!(name in before.tables)) notes.push(`new table ${name}: ${after.tables[name]} rows`);
  }
}

function compareTeams(before, after, problems) {
  for (const [id, team] of Object.entries(before.teams)) {
    const now = after.teams[id];
    if (!now) problems.push(`team ${team.name} (${id}) is gone`);
    else if (now.roster !== team.roster) problems.push(`team ${team.name}: roster changed`);
    else if (now.revision !== team.revision) problems.push(`team ${team.name}: revision ${team.revision} → ${now.revision}`);
  }
}

export function compareSnapshots(before, after) {
  const problems = [];
  const notes = [];
  compareTables(before, after, problems, notes);
  compareTeams(before, after, problems);
  if (before.season.pairings !== after.season.pairings) problems.push("season_pairings results changed");
  if (before.season.entries !== after.season.entries) problems.push("season_entries changed");
  const added = after.migrations.filter((name) => !before.migrations.includes(name));
  if (added.length) notes.push(`migrations applied: ${added.join(", ")}`);
  for (const row of after.stages ?? []) {
    if (!["draft", "active"].includes(row.stage)) problems.push(`team ${row.name}: unexpected stage ${row.stage}`);
  }
  if (after.preferencesSet) problems.push(`${after.preferencesSet} users already have preferences set`);
  return { problems, notes };
}

function reason(row) {
  return [row.entered && "entered in the current season", row.playedMatch && "has a played match"].filter(Boolean).join(", ") || "no entry, no match";
}

export function renderReport(before, after, { problems, notes }) {
  const names = Object.fromEntries(Object.entries(after.teams).map(([id, team]) => [id, team.name]));
  const lines = [
    `# Rehearsal report — ${after.takenAt}`,
    "",
    problems.length ? `**${problems.length} problem(s)**` : "**OK** — no existing data changed",
    "",
    ...problems.map((problem) => `- ✗ ${problem}`),
    ...notes.map((note) => `- ${note}`),
    "",
    "## Stages",
    "",
    ...(after.stages ? after.stages.map((row) => `- ${row.name} — ${row.stage} — ${reason(row)}`) : ["- (no stage column yet)"]),
    "",
    "## Fallen players carried over",
    "",
    ...(after.fallen ? Object.entries(after.fallen).map(([id, count]) => `- ${names[id] ?? id}: ${count}`) : ["- (no fallen table yet)"]),
    "",
    "## Open states",
    "",
    `- preparing (pre-match begun, match not started): ${after.open.preparing.map((row) => `${row.id} (${row.matchKind})`).join(", ") || "none"}`,
    `- started, post-match not finished: ${after.open.startedWithoutPost.map((row) => `${row.id} (${row.matchKind})`).join(", ") || "none"}`,
    `- result awaiting confirmation: ${after.open.awaitingConfirmation.map((row) => `${row.id} (${row.matchKind})`).join(", ") || "none"}`,
    `- pending friendly challenges: ${after.open.pendingChallenges}`,
    "",
    `Before: ${before.takenAt}, ${before.migrations.length} migrations. After: ${after.migrations.length} migrations.`,
  ];
  return `${lines.join("\n")}\n`;
}
```

- [ ] **Step 4: Тесты**

Run: `node --test test/rehearsal-snapshot.test.mjs && npm run check`
Expected: PASS (6 тестов); `check` без замечаний (функции до 80 строк).

- [ ] **Step 5: Commit**

```bash
git add scripts/rehearsal/snapshot.mjs test/rehearsal-snapshot.test.mjs
git commit -m "feat(rehearsal): database snapshot and before/after comparison"
```

---

### Task 5: `npm run rehearsal:check`, документация, сухой прогон, PR

**Files:**
- Create: `scripts/rehearsal-check.mjs`, `scripts/rehearsal-migrate.mjs`
- Modify: `README.md` (новый раздел), `package.json` (`scripts`)

**Interfaces:**
- Consumes: `rehearsalDatabaseUrl` (Task 2), `takeSnapshot`, `compareSnapshots`, `renderReport` (Task 4).
- Produces: `npm run rehearsal:check -- --before` → `output/rehearsal/before.json`; `--after` → `output/rehearsal/after.json` и `output/rehearsal/report.md`, код 1 при проблемах; `npm run rehearsal:migrate` — миграции на `gata_rehearsal` с замером времени.

- [ ] **Step 1: Команда**

`scripts/rehearsal-check.mjs`:

```js
#!/usr/bin/env node
/**
 * Snapshot the rehearsal database before migrating, and compare after.
 *
 *   npm run rehearsal:check -- --before
 *   npm run rehearsal:migrate
 *   npm run rehearsal:check -- --after      # writes output/rehearsal/report.md
 *
 * Always reads gata_rehearsal (scripts/rehearsal/guard.mjs), never the database
 * DATABASE_URL names. Exits 1 when existing data changed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";
import { compareSnapshots, renderReport, takeSnapshot } from "./rehearsal/snapshot.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "output", "rehearsal");
await loadEnvFile(rootDir);

async function readBefore() {
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, "before.json"), "utf8"));
  } catch {
    throw new Error("no output/rehearsal/before.json — run `npm run rehearsal:check -- --before` before migrating");
  }
}

async function main() {
  const phase = process.argv.includes("--before") ? "before" : process.argv.includes("--after") ? "after" : null;
  if (!phase) throw new Error("usage: npm run rehearsal:check -- --before | --after");
  const before = phase === "after" ? await readBefore() : null;
  const client = new pg.Client({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
  await client.connect();
  let snapshot;
  try {
    snapshot = await takeSnapshot(client);
  } finally {
    await client.end();
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${phase}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  if (phase === "before") {
    console.log(`rehearsal:check: snapshot of ${Object.keys(snapshot.teams).length} teams written to output/rehearsal/before.json`);
    return;
  }
  const comparison = compareSnapshots(before, snapshot);
  await fs.writeFile(path.join(outDir, "report.md"), renderReport(before, snapshot, comparison));
  console.log(comparison.problems.length
    ? `rehearsal:check: ${comparison.problems.length} problem(s) — see output/rehearsal/report.md`
    : "rehearsal:check: OK — no existing data changed (output/rehearsal/report.md)");
  if (comparison.problems.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`rehearsal:check: ${error.message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 1b: Миграции на репетиционной базе**

`scripts/rehearsal-migrate.mjs`:

```js
#!/usr/bin/env node
/**
 * Apply outstanding migrations to gata_rehearsal and say how long they took.
 *
 * The same code path as `npm run db:migrate` (server/db/migrate.mjs), pointed
 * at the rehearsal database so nobody has to assemble its URL by hand. The
 * time is what the cutover's maintenance window has to allow for.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { applyMigrations } from "../server/db/migrate.mjs";
import { rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

const pool = new pg.Pool({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
const started = performance.now();
try {
  const applied = await applyMigrations(pool);
  console.log(`rehearsal:migrate: applied ${applied.length} migration(s) in ${Math.round(performance.now() - started)} ms${applied.length ? `: ${applied.join(", ")}` : ""}`);
} catch (error) {
  console.error(`rehearsal:migrate: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
```

В `package.json` → `scripts` после `"rehearsal:check": …` добавить (запятая у предыдущей строки):

```json
    "rehearsal:migrate": "node scripts/rehearsal-migrate.mjs"
```

- [ ] **Step 2: README**

В `README.md` после раздела про smoke-проверки добавить:

````markdown
## Rehearsing a migration on a copy of production

Before a release that changes the schema, restore a production dump locally,
anonymized, and prove the migrations leave existing data alone. Rehearsals only
ever touch the local database `gata_rehearsal`.

1. Copy a dump from the server (see DEPLOYMENT.md, "Database Backups") into
   `~/gata-dumps/` on an encrypted disk, mode 600.
2. Set `REHEARSAL_PASSWORD` in `.env` — every restored account gets it.
3. Run:

```bash
npm run rehearsal:restore -- ~/gata-dumps/gata_league-YYYYMMDD-HHMMSS.dump
npm run rehearsal:check -- --before
npm run rehearsal:migrate
npm run rehearsal:check -- --after
```

`output/rehearsal/report.md` says whether anything existing changed, which stage
each team got and why, which fallen players were carried over, and which matches
are still half-way through. To click through as any coach, start the server
with `DATABASE_URL` pointing at `gata_rehearsal` (same credentials as your
`.env`, database name swapped). Delete the dumps and `gata_rehearsal` when the
release has settled.
````

- [ ] **Step 3: Сухой прогон на локальном дампе**

```bash
npm run rehearsal:restore -- "$(ls -1t output/backups/gata_league-*.dump | head -1)"
npm run rehearsal:check -- --before
npm run rehearsal:migrate
npm run rehearsal:check -- --after
cat output/rehearsal/report.md
rm output/rehearsal/before.json
npm run rehearsal:check -- --after; echo "exit $?"
```

Expected: `rehearsal:migrate` печатает `applied 0 migration(s)`; `--after` печатает `OK — no existing data changed`; в отчёте `(no stage column yet)` — миграций 3.0 ещё нет; последний вызов без `before.json` завершается с понятной ошибкой и кодом 1.

- [ ] **Step 4: Полная проверка**

Run: `npm test && npm run check && npm run i18n:check && npm run build`
Expected: всё зелёное.

- [ ] **Step 5: Commit, пуш, PR в `redesign`**

```bash
git add scripts/rehearsal-check.mjs scripts/rehearsal-migrate.mjs package.json README.md
git commit -m "feat(rehearsal): rehearsal:check report, docs"
git push -u origin rd/01-rehearsal
gh pr create --base redesign --head rd/01-rehearsal --title "rd/01: rehearsal tooling and the table layout from PR #9" --body-file <scratchpad>/pr-rd-01.md
```

Тело PR: что входит, вывод проверок, вывод сухого прогона (без содержимого базы), отметка «PR #9 закрыт, перенесено: …», строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 6: Ревью и слияние** — по протоколу мастер-плана (§ «Протокол этапа», шаги 7–9): финальный ревьюер по всей ветке, исправления, `gh pr merge --merge`, отметка этапа 01 в мастер-плане, `git worktree remove ../bb-rd-01`.

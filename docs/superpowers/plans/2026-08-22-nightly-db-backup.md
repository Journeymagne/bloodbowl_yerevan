# Ежедневный ночной бэкап базы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** раз в сутки снимать проверенный дамп базы `gata_league` на VPS и хранить семь последних.

**Architecture:** чистая логика (именование дампов, выбор файлов на удаление, оценка свежести) живёт в маленьких модулях под `scripts/backup/` и покрыта `node --test`; вызовы `docker` и печать статуса — в двух тонких CLI-обёртках `scripts/backup-db.mjs` и `scripts/backup-status.mjs`. Запускает systemd-таймер, юниты которого лежат в репозитории и подключены на сервере симлинками. Дамп получает финальное имя только после проверки — незавершённый файл никогда не выглядит как готовый.

**Tech Stack:** Node 20 (ESM, `node:test`), Docker CLI, systemd, PostgreSQL 16 (`pg_dump -Fc` / `pg_restore`).

**Спека:** [`docs/superpowers/specs/2026-08-22-nightly-db-backup-design.md`](../specs/2026-08-22-nightly-db-backup-design.md)

## Global Constraints

- **Никаких новых npm-зависимостей.** В `dependencies` есть ровно один пакет (`pg`), и так должно остаться. Всё делается на стандартной библиотеке Node.
- **Код и комментарии в коде — на английском.** Так написан весь существующий код (`server/config/env-file.mjs`, `server/http/static-path.mjs`).
- **`DEPLOYMENT.md` и `README.md` — на английском.** Спеки и планы в `docs/superpowers/` — на русском.
- **Сообщения коммитов — английские, conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`), как в существующей истории.
- **Правила i18n из `CLAUDE.md` к этой работе не применяются:** ни одной строки пользовательского интерфейса здесь не появляется. Ключи в `src/i18n/en.json` / `ru.json` **не добавляются**. Если задача склоняет добавить UI — это выход за рамки, так делать не нужно.
- **`content/Gata` и `content/Gata-ru` не трогаются вообще**, поэтому `npm run i18n:check` в приёмку не входит.
- **Имя контейнера базы:** `gata-league-postgres`. **Имя базы и пользователя** берутся из env-файла (`POSTGRES_DB`, `POSTGRES_USER`), а не зашиваются в код.
- **Каталог бэкапов по умолчанию:** `/var/backups/bloodbowl-league`, переопределяется переменной `BACKUP_DIR` (нужно для тестов и локальной проверки).
- **Глубина хранения по умолчанию:** 7 файлов.
- **Метки времени в именах файлов — только UTC.**
- Каждая задача завершается коммитом. `npm test` должен быть зелёным на каждом коммите.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `server/config/env-file.mjs` (изменяется) | найти env-файл (уже умеет) + разобрать его содержимое (добавляется) |
| `server/server.mjs` (изменяется) | перестаёт разбирать env-файл сам, использует общий разбор |
| `scripts/backup/rotation.mjs` (создаётся) | имена дампов: сформировать, разобрать, выбрать лишние на удаление. Чистые функции, никакого ввода-вывода |
| `scripts/backup/create.mjs` (создаётся) | порядок «снять → проверить → переименовать → ротировать». Работает с файловой системой, но команду дампа получает извне |
| `scripts/backup/status.mjs` (создаётся) | оценка набора дампов: сколько, насколько свежие, всё ли в порядке. Чистая функция |
| `scripts/backup-db.mjs` (создаётся) | CLI: env → вызовы `docker` → `createBackup` |
| `scripts/backup-status.mjs` (создаётся) | CLI: чтение каталога и `systemctl` → печать → код возврата |
| `deploy/systemd/bloodbowl-backup.service` (создаётся) | как запускать |
| `deploy/systemd/bloodbowl-backup.timer` (создаётся) | когда запускать |
| `test/backup-rotation.test.mjs` (создаётся) | тесты именования и ротации |
| `test/backup-create.mjs` → `test/backup-create.test.mjs` (создаётся) | тесты инварианта «недоснятый дамп не становится готовым» |
| `test/backup-status.test.mjs` (создаётся) | тесты оценки свежести |
| `test/env-file.test.mjs` (изменяется) | тесты разбора env-файла |
| `package.json` (изменяется) | скрипты `backup:db`, `backup:status` |
| `DEPLOYMENT.md` (изменяется) | установка, проверка, восстановление |

---

## Task 1: Общий разбор env-файла

Скрипту бэкапа нужны `POSTGRES_DB` и `POSTGRES_USER` из `/etc/bloodbowl-league/.env`. Сейчас `server/config/env-file.mjs` умеет только найти путь к файлу, а разбор строк зашит внутрь `loadEnvFile()` в `server/server.mjs` и наружу не отдаётся. Вынести его, чтобы не заводить второй парсер тех же строк.

**Files:**
- Modify: `server/config/env-file.mjs`
- Modify: `server/server.mjs:13-33` (функция `loadEnvFile`)
- Test: `test/env-file.test.mjs`

**Interfaces:**
- Consumes: существующий `resolveEnvFilePath(rootDir, options)` из того же файла.
- Produces:
  - `parseEnvFile(body: string): Map<string, string>` — при повторе ключа побеждает **первое** вхождение (так ведёт себя текущий код в `server.mjs`).
  - `readEnvValues(rootDir: string, options?): Promise<Map<string, string>>` — находит файл и разбирает его; если файла нет или он не читается — пустой `Map`.

- [ ] **Step 1: Написать падающие тесты**

Дописать в конец `test/env-file.test.mjs`:

```js
test("parses keys, ignoring comments and blank lines", () => {
  const values = parseEnvFile(["# comment", "", "POSTGRES_DB=gata_league", "POSTGRES_USER=gata_admin"].join("\n"));
  assert.deepEqual([...values], [["POSTGRES_DB", "gata_league"], ["POSTGRES_USER", "gata_admin"]]);
});

test("keeps everything after the first equals sign", () => {
  const values = parseEnvFile("DATABASE_URL=postgres://user:p=ss@localhost:5433/db");
  assert.equal(values.get("DATABASE_URL"), "postgres://user:p=ss@localhost:5433/db");
});

test("strips surrounding quotes and outer whitespace", () => {
  const values = parseEnvFile(['ADMIN_PASSWORD="quoted secret"', "  ADMIN_LOGIN = admin  "].join("\n"));
  assert.equal(values.get("ADMIN_PASSWORD"), "quoted secret");
  assert.equal(values.get("ADMIN_LOGIN"), "admin");
});

test("the first occurrence of a key wins, matching how the server loaded the file", () => {
  const values = parseEnvFile(["APP_PORT=3002", "APP_PORT=9999"].join("\n"));
  assert.equal(values.get("APP_PORT"), "3002");
});

test("skips lines that carry no assignment", () => {
  const values = parseEnvFile(["nonsense", "#KEY=value", "=orphan"].join("\n"));
  assert.equal(values.size, 0);
});

test("handles CRLF line endings", () => {
  const values = parseEnvFile("POSTGRES_DB=gata_league\r\nPOSTGRES_USER=gata_admin\r\n");
  assert.equal(values.get("POSTGRES_USER"), "gata_admin");
});
```

И поправить строку импорта в начале файла:

```js
import { parseEnvFile, resolveEnvFilePath, SYSTEM_ENV_PATH } from "../server/config/env-file.mjs";
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

```bash
node --test test/env-file.test.mjs
```

Ожидается: падение с `SyntaxError` про отсутствующий экспорт `parseEnvFile` (`The requested module ... does not provide an export named 'parseEnvFile'`).

- [ ] **Step 3: Реализовать разбор**

В `server/config/env-file.mjs` добавить в начало файла к существующим импортам:

```js
import { promises as fsPromises } from "node:fs";
```

и дописать в конец файла:

```js
/**
 * Parse the contents of an env file.
 *
 * A repeated key keeps its first value: the server used to assign straight into
 * process.env and skip keys that were already set, so the first line won.
 * Anything else would silently change which password the app loads.
 *
 * @param {string} body
 * @returns {Map<string, string>}
 */
export function parseEnvFile(body) {
  const values = new Map();
  for (const line of String(body ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !values.has(key)) values.set(key, value);
  }
  return values;
}

/**
 * Locate the env file and read the values out of it.
 *
 * A missing or unreadable file is not an error here: local development runs
 * without one, and the caller decides which keys it cannot do without.
 *
 * @param {string} rootDir
 * @param {object} [options] Passed through to resolveEnvFilePath.
 * @returns {Promise<Map<string, string>>}
 */
export async function readEnvValues(rootDir, options = {}) {
  const envPath = resolveEnvFilePath(rootDir, options);
  if (!envPath) return new Map();
  try {
    return parseEnvFile(await fsPromises.readFile(envPath, "utf8"));
  } catch {
    return new Map();
  }
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

```bash
node --test test/env-file.test.mjs
```

Ожидается: `pass 12`, `fail 0`.

- [ ] **Step 5: Переключить сервер на общий разбор**

В `server/server.mjs` заменить импорт (строка 8):

```js
import { readEnvValues } from "./config/env-file.mjs";
```

и целиком заменить функцию `loadEnvFile` (строки 13–33) на:

```js
async function loadEnvFile() {
  // A variable already present in the real environment wins over the file:
  // that is how systemd and docker overrides have always been able to win.
  for (const [key, value] of await readEnvValues(rootDir)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
```

- [ ] **Step 6: Проверить, что сервер по-прежнему поднимается**

```bash
npm test
```

Ожидается: все тесты проходят.

```bash
BLOODBOWL_ENV_FILE=.env.example node -e "import('./server/config/env-file.mjs').then(async (m) => { const v = await m.readEnvValues(process.cwd()); console.log(v.get('POSTGRES_DB'), v.get('POSTGRES_USER')); })"
```

Ожидается: `gata_league gata_admin`.

- [ ] **Step 7: Коммит**

```bash
git add server/config/env-file.mjs server/server.mjs test/env-file.test.mjs
git commit -m "refactor(config): share the env file parser with other scripts"
```

---

## Task 2: Имена дампов и выбор лишних файлов

Самая опасная часть работы: этот код удаляет файлы. Он чистый — никакого ввода-вывода, только имена и метки времени на входе и решение на выходе.

**Files:**
- Create: `scripts/backup/rotation.mjs`
- Test: `test/backup-rotation.test.mjs`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `DEFAULT_KEEP: number` (= 7), `PARTIAL_SUFFIX: string` (= `".partial"`), `PARTIAL_MAX_AGE_MS: number` (= 24 часа).
  - `formatDumpName(date: Date): string` → `"gata_league-20260822-040000.dump"`.
  - `parseDumpTimestamp(name: string): Date | null` — обратна `formatDumpName`; `null` для чужих имён.
  - `isDumpName(name: string): boolean`.
  - `planRotation(entries: Array<{name: string, mtimeMs: number}>, options?: {keep?: number, now?: Date, partialMaxAgeMs?: number}): {keep: string[], remove: string[]}` — `remove` включает и устаревшие `.partial`. Бросает `RangeError`, если `keep` не целое число ≥ 1.

- [ ] **Step 1: Написать падающий тест**

Создать `test/backup-rotation.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_KEEP,
  PARTIAL_MAX_AGE_MS,
  formatDumpName,
  isDumpName,
  parseDumpTimestamp,
  planRotation,
} from "../scripts/backup/rotation.mjs";

const dumpsFor = (...days) => days.map((day) => ({
  name: `gata_league-202608${String(day).padStart(2, "0")}-040000.dump`,
  mtimeMs: 0,
}));

test("formats a dump name from a UTC timestamp", () => {
  assert.equal(formatDumpName(new Date("2026-08-22T04:00:00Z")), "gata_league-20260822-040000.dump");
});

test("formats in UTC regardless of the local timezone", () => {
  // 01:30 UTC on the 22nd is still the 21st in several timezones; the name must
  // not drift with the machine's clock settings.
  assert.equal(formatDumpName(new Date("2026-08-22T01:30:07Z")), "gata_league-20260822-013007.dump");
});

test("parseDumpTimestamp is the inverse of formatDumpName", () => {
  const when = new Date("2026-08-22T04:05:06Z");
  assert.deepEqual(parseDumpTimestamp(formatDumpName(when)), when);
});

test("parseDumpTimestamp refuses names that are not dumps", () => {
  for (const name of [
    "gata_league-20260822-040000.dump.partial",
    "gata_league-2026-08-22.dump",
    "other-20260822-040000.dump",
    "gata_league-20260822-040000.dump.gz",
    "notes.txt",
    "",
    // Dump-shaped but calendar-impossible. Without a round-trip check these
    // parse into some other date, sort as the newest file, and push a real
    // backup out of the seven that are kept.
    "gata_league-99999999-999999.dump",
    "gata_league-20260230-040000.dump",
    "gata_league-20261301-040000.dump",
    "gata_league-20260822-250000.dump",
    "gata_league-20260822-046000.dump",
  ]) {
    assert.equal(parseDumpTimestamp(name), null, `expected ${name} to be refused`);
    assert.equal(isDumpName(name), false, `expected ${name} not to count as a dump`);
  }
});

test("keeps everything when there are fewer dumps than the limit", () => {
  const plan = planRotation(dumpsFor(1, 2, 3), { keep: 7, now: new Date("2026-09-01T00:00:00Z") });
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.keep.length, 3);
});

test("keeps exactly the newest seven and removes the rest", () => {
  const plan = planRotation(dumpsFor(9, 1, 5, 3, 10, 2, 7, 4, 8, 6), {
    keep: 7,
    now: new Date("2026-09-01T00:00:00Z"),
  });
  assert.equal(plan.keep.length, 7);
  assert.deepEqual(plan.remove, [
    "gata_league-20260801-040000.dump",
    "gata_league-20260802-040000.dump",
    "gata_league-20260803-040000.dump",
  ]);
  assert.equal(plan.keep.at(0), "gata_league-20260804-040000.dump");
  assert.equal(plan.keep.at(-1), "gata_league-20260810-040000.dump");
});

test("never touches files that are not dumps", () => {
  const plan = planRotation([
    ...dumpsFor(1, 2, 3, 4, 5, 6, 7, 8),
    { name: "README", mtimeMs: 0 },
    { name: "gata_league-20260101-040000.sql", mtimeMs: 0 },
    { name: ".keep", mtimeMs: 0 },
  ], { keep: 7, now: new Date("2026-09-01T00:00:00Z") });

  assert.deepEqual(plan.remove, ["gata_league-20260801-040000.dump"]);
});

test("a partial file is not a dump and does not fill one of the seven slots", () => {
  const now = new Date("2026-08-09T04:00:00Z");
  const plan = planRotation([
    ...dumpsFor(1, 2, 3, 4, 5, 6, 7),
    { name: "gata_league-20260809-040000.dump.partial", mtimeMs: now.getTime() },
  ], { keep: 7, now });

  assert.equal(plan.keep.length, 7);
  assert.equal(plan.remove.length, 0);
});

test("removes a partial left behind for more than a day", () => {
  const now = new Date("2026-08-09T04:00:00Z");
  const plan = planRotation([
    { name: "gata_league-20260807-040000.dump.partial", mtimeMs: now.getTime() - PARTIAL_MAX_AGE_MS - 1000 },
    { name: "gata_league-20260809-035900.dump.partial", mtimeMs: now.getTime() - 60_000 },
  ], { keep: 7, now });

  assert.deepEqual(plan.remove, ["gata_league-20260807-040000.dump.partial"]);
});

test("refuses a keep count that would wipe the directory", () => {
  for (const keep of [0, -1, 1.5, Number.NaN, "7"]) {
    assert.throws(() => planRotation(dumpsFor(1, 2), { keep }), RangeError);
  }
});

test("the default keep count is seven", () => {
  assert.equal(DEFAULT_KEEP, 7);
  const plan = planRotation(dumpsFor(1, 2, 3, 4, 5, 6, 7, 8), { now: new Date("2026-09-01T00:00:00Z") });
  assert.equal(plan.keep.length, 7);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/backup-rotation.test.mjs
```

Ожидается: падение с `ERR_MODULE_NOT_FOUND` — `scripts/backup/rotation.mjs` не существует.

- [ ] **Step 3: Реализовать модуль**

Создать `scripts/backup/rotation.mjs`:

```js
// Dump file names carry a fixed-width UTC timestamp, so sorting the names
// lexicographically sorts them by age. That is deliberate: mtime is rewritten
// by copying a file around, and rotation must not depend on it.
const DUMP_NAME = /^gata_league-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/;

export const DEFAULT_KEEP = 7;
export const PARTIAL_SUFFIX = ".partial";
export const PARTIAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const pad = (value, width) => String(value).padStart(width, "0");

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatDumpName(date) {
  const stamp = [
    pad(date.getUTCFullYear(), 4),
    pad(date.getUTCMonth() + 1, 2),
    pad(date.getUTCDate(), 2),
    "-",
    pad(date.getUTCHours(), 2),
    pad(date.getUTCMinutes(), 2),
    pad(date.getUTCSeconds(), 2),
  ].join("");
  return `gata_league-${stamp}.dump`;
}

/**
 * @param {string} name
 * @returns {Date|null} null when the name was not produced by formatDumpName.
 */
export function parseDumpTimestamp(name) {
  const safeName = String(name ?? "");
  const match = DUMP_NAME.exec(safeName);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  // Date.UTC() silently rolls over out-of-range components (e.g. month 13,
  // Feb 30) instead of rejecting them, so a dump-shaped but calendar-impossible
  // name would otherwise parse into some other, misleading date. Confirm the
  // parse round-trips through the formatter before trusting it.
  if (formatDumpName(date) !== safeName) return null;
  return date;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isDumpName(name) {
  return parseDumpTimestamp(name) !== null;
}

function isPartialName(name) {
  return String(name ?? "").endsWith(PARTIAL_SUFFIX)
    && isDumpName(String(name).slice(0, -PARTIAL_SUFFIX.length));
}

/**
 * Decide which files in the backup directory may go.
 *
 * Anything the naming scheme does not recognise is left alone: this function
 * deletes data, and a stray file is not reason enough to guess.
 *
 * @param {Array<{name: string, mtimeMs: number}>} entries
 * @param {{keep?: number, now?: Date, partialMaxAgeMs?: number}} [options]
 * @returns {{keep: string[], remove: string[]}}
 */
export function planRotation(entries, options = {}) {
  const { keep = DEFAULT_KEEP, now = new Date(), partialMaxAgeMs = PARTIAL_MAX_AGE_MS } = options;
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError(`keep must be an integer of at least 1, got ${String(keep)}`);
  }

  const dumps = entries
    .map((entry) => entry.name)
    .filter(isDumpName)
    .sort();
  const cut = Math.max(0, dumps.length - keep);

  // A dump that never finished is not a backup, but it is also not garbage
  // until it is clearly abandoned — a run still in flight owns a fresh one.
  const abandonedPartials = entries
    .filter((entry) => isPartialName(entry.name))
    .filter((entry) => now.getTime() - entry.mtimeMs >= partialMaxAgeMs)
    .map((entry) => entry.name);

  return {
    keep: dumps.slice(cut),
    remove: [...dumps.slice(0, cut), ...abandonedPartials],
  };
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/backup-rotation.test.mjs
```

Ожидается: `pass 11`, `fail 0`.

- [ ] **Step 5: Коммит**

```bash
git add scripts/backup/rotation.mjs test/backup-rotation.test.mjs
git commit -m "feat(backup): name dumps by UTC stamp and pick which ones to drop"
```

---

## Task 3: Снятие дампа с проверкой перед переименованием

Инвариант этой задачи: файл с именем `*.dump` существует только если дамп снят полностью и прочитан обратно. Всё, что связано с `docker`, передаётся внутрь параметрами, поэтому тест проверяет именно порядок и последствия, без контейнеров.

**Files:**
- Create: `scripts/backup/create.mjs`
- Test: `test/backup-create.test.mjs`

**Interfaces:**
- Consumes: `formatDumpName`, `planRotation`, `PARTIAL_SUFFIX` из `scripts/backup/rotation.mjs` (Task 2).
- Produces:
  - `MIN_DUMP_BYTES: number` (= 512).
  - `createBackup(options: {backupDir: string, runDump: (target: string) => Promise<void>, verifyDump: (target: string) => Promise<void>, now?: Date, keep?: number, minBytes?: number}): Promise<{path: string, removed: string[]}>`.
  - `rotate(backupDir: string, options?: {keep?: number, now?: Date}): Promise<string[]>` — возвращает имена удалённых файлов.

- [ ] **Step 1: Написать падающий тест**

Создать `test/backup-create.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createBackup } from "../scripts/backup/create.mjs";

const makeDir = () => fs.mkdtemp(path.join(os.tmpdir(), "gata-backup-"));
const listing = async (dir) => (await fs.readdir(dir)).sort();

// A stand-in for pg_dump: writes the requested number of bytes where told.
const writes = (bytes) => async (target) => {
  await fs.writeFile(target, Buffer.alloc(bytes, 0x41));
};
const succeeds = async () => {};
const fails = (message) => async () => {
  throw new Error(message);
};

const now = new Date("2026-08-22T04:00:00Z");

test("a successful run leaves exactly one finished dump", async () => {
  const dir = await makeDir();
  const result = await createBackup({
    backupDir: dir,
    runDump: writes(4096),
    verifyDump: succeeds,
    now,
  });

  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);
  assert.equal(result.path, path.join(dir, "gata_league-20260822-040000.dump"));
  assert.deepEqual(result.removed, []);
});

test("the finished dump is readable only by its owner", async () => {
  const dir = await makeDir();
  const result = await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  const stat = await fs.stat(result.path);
  assert.equal(stat.mode & 0o777, 0o600);
});

test("a failing dump leaves nothing behind and reports the failure", async () => {
  const dir = await makeDir();
  await assert.rejects(
    () => createBackup({
      backupDir: dir,
      runDump: async (target) => {
        await fs.writeFile(target, Buffer.alloc(100));
        throw new Error("pg_dump exited with 1");
      },
      verifyDump: succeeds,
      now,
    }),
    /pg_dump exited with 1/,
  );

  assert.deepEqual(await listing(dir), []);
});

test("a dump that fails verification never gets its final name", async () => {
  const dir = await makeDir();
  await assert.rejects(
    () => createBackup({
      backupDir: dir,
      runDump: writes(4096),
      verifyDump: fails("pg_restore could not read the archive"),
      now,
    }),
    /could not read the archive/,
  );

  assert.deepEqual(await listing(dir), []);
});

test("a suspiciously small dump is treated as a failure", async () => {
  const dir = await makeDir();
  await assert.rejects(
    () => createBackup({ backupDir: dir, runDump: writes(10), verifyDump: succeeds, now }),
    /10 bytes/,
  );

  assert.deepEqual(await listing(dir), []);
});

test("an earlier failure does not block the next run", async () => {
  const dir = await makeDir();
  await assert.rejects(() => createBackup({
    backupDir: dir,
    runDump: writes(4096),
    verifyDump: fails("broken"),
    now,
  }));

  await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);
});

test("rotation runs after a successful backup and keeps seven files", async () => {
  const dir = await makeDir();
  for (const day of [14, 15, 16, 17, 18, 19, 20]) {
    await fs.writeFile(path.join(dir, `gata_league-202608${day}-040000.dump`), Buffer.alloc(4096));
  }

  const result = await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });

  const files = await listing(dir);
  assert.equal(files.length, 7);
  assert.deepEqual(result.removed, ["gata_league-20260814-040000.dump"]);
  assert.ok(files.includes("gata_league-20260822-040000.dump"));
  assert.ok(!files.includes("gata_league-20260814-040000.dump"));
});

test("rotation leaves unrelated files in the directory alone", async () => {
  const dir = await makeDir();
  for (const day of [14, 15, 16, 17, 18, 19, 20]) {
    await fs.writeFile(path.join(dir, `gata_league-202608${day}-040000.dump`), Buffer.alloc(4096));
  }
  await fs.writeFile(path.join(dir, "restore-notes.txt"), "keep me");

  await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });

  assert.ok((await listing(dir)).includes("restore-notes.txt"));
});

test("creates the backup directory when it is not there yet", async () => {
  const dir = path.join(await makeDir(), "nested");
  await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/backup-create.test.mjs
```

Ожидается: падение с `ERR_MODULE_NOT_FOUND` — `scripts/backup/create.mjs` не существует.

- [ ] **Step 3: Реализовать модуль**

Создать `scripts/backup/create.mjs`:

```js
import { promises as fs } from "node:fs";
import path from "node:path";

import { PARTIAL_SUFFIX, formatDumpName, planRotation } from "./rotation.mjs";

// A custom-format dump of an empty database is already well over this; anything
// smaller means the dump was cut off rather than merely uneventful.
export const MIN_DUMP_BYTES = 512;

/**
 * Take one backup: dump, check, then name it.
 *
 * The dump is written under a .partial name and only renamed once it has been
 * read back, so a run that dies halfway — out of disk, container restarted —
 * cannot leave a file that looks like a usable backup.
 *
 * @param {{
 *   backupDir: string,
 *   runDump: (target: string) => Promise<void>,
 *   verifyDump: (target: string) => Promise<void>,
 *   now?: Date,
 *   keep?: number,
 *   minBytes?: number,
 * }} options
 * @returns {Promise<{path: string, removed: string[]}>}
 */
export async function createBackup(options) {
  const {
    backupDir,
    runDump,
    verifyDump,
    now = new Date(),
    keep,
    minBytes = MIN_DUMP_BYTES,
  } = options;

  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

  const finalName = formatDumpName(now);
  const finalPath = path.join(backupDir, finalName);
  const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;

  try {
    await runDump(partialPath);
    const { size } = await fs.stat(partialPath);
    if (size < minBytes) {
      throw new Error(`dump is only ${size} bytes, expected at least ${minBytes}`);
    }
    await verifyDump(partialPath);
    await fs.chmod(partialPath, 0o600);
    await fs.rename(partialPath, finalPath);
  } catch (error) {
    await fs.rm(partialPath, { force: true });
    throw error;
  }

  const removed = await rotate(backupDir, { keep, now });
  return { path: finalPath, removed };
}

/**
 * Delete the dumps that fell out of the retention window.
 *
 * @param {string} backupDir
 * @param {{keep?: number, now?: Date}} [options]
 * @returns {Promise<string[]>} names of the files removed
 */
export async function rotate(backupDir, options = {}) {
  const dirEntries = await fs.readdir(backupDir, { withFileTypes: true });
  const entries = [];
  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    const { mtimeMs } = await fs.stat(path.join(backupDir, entry.name));
    entries.push({ name: entry.name, mtimeMs });
  }

  const { remove } = planRotation(entries, {
    now: options.now,
    ...(options.keep === undefined ? {} : { keep: options.keep }),
  });
  for (const name of remove) {
    await fs.rm(path.join(backupDir, name), { force: true });
  }
  return remove;
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

```bash
node --test test/backup-create.test.mjs
```

Ожидается: `pass 9`, `fail 0`.

```bash
npm test
```

Ожидается: все тесты репозитория проходят.

- [ ] **Step 5: Коммит**

```bash
git add scripts/backup/create.mjs test/backup-create.test.mjs
git commit -m "feat(backup): name a dump only after reading it back"
```

---

## Task 4: CLI снятия бэкапа

Тонкая обвязка: достать имена базы и пользователя из env-файла, собрать команды `docker`, отдать их в `createBackup`. Логики с ветвлениями здесь быть не должно — она вся уже покрыта тестами в задачах 2 и 3.

**Files:**
- Create: `scripts/backup-db.mjs`
- Modify: `package.json` (раздел `scripts`)

**Interfaces:**
- Consumes: `readEnvValues` (Task 1), `createBackup` (Task 3), `DEFAULT_KEEP` (Task 2).
- Produces: команда `npm run backup:db`; переменные окружения `BACKUP_DIR`, `POSTGRES_CONTAINER`, `BACKUP_KEEP`.

- [ ] **Step 1: Выяснить, нужен ли пароль для `pg_dump` внутри контейнера**

Локально (или на сервере — ответ должен совпасть, образ один и тот же):

```bash
npm run postgres:up
docker exec gata-league-postgres pg_dump -U gata_admin -d gata_league --schema-only -f /dev/null && echo "БЕЗ ПАРОЛЯ РАБОТАЕТ"
```

Ожидается: `БЕЗ ПАРОЛЯ РАБОТАЕТ` — в образе `postgres:16` локальные подключения по unix-сокету настроены на `trust`.

Если вместо этого напечаталось `password authentication failed`, проверить, что docker пробрасывает переменную окружения без значения:

```bash
PGPASSWORD=probe docker exec -e PGPASSWORD gata-league-postgres printenv PGPASSWORD
```

Ожидается: `probe`. Тогда в шаге 2 раскомментировать блок с паролем (он помечен в коде) — пароль пойдёт через окружение процесса, а не через аргументы, и не будет виден в `ps` на хосте.

- [ ] **Step 2: Написать CLI**

Создать `scripts/backup-db.mjs`:

```js
#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readEnvValues } from "../server/config/env-file.mjs";
import { DEFAULT_KEEP } from "./backup/rotation.mjs";
import { createBackup } from "./backup/create.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = process.env.BACKUP_DIR || "/var/backups/bloodbowl-league";
const container = process.env.POSTGRES_CONTAINER || "gata-league-postgres";
const keep = Number(process.env.BACKUP_KEEP || DEFAULT_KEEP);

function run(command, args, { onStdout = null, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", onStdout ? "pipe" : "ignore", "pipe"],
      env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    if (onStdout) child.stdout.pipe(onStdout);

    const exited = new Promise((done, failed) => {
      child.on("error", failed);
      child.on("close", done);
    });
    // The child can exit before the file it was piped into has flushed, so wait
    // for both: otherwise a truncated dump can look like a clean run.
    const written = onStdout
      ? new Promise((done, failed) => {
          onStdout.on("close", done);
          onStdout.on("error", failed);
        })
      : Promise.resolve();

    Promise.all([exited, written]).then(([code]) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr.trim()}`));
    }, reject);
  });
}

async function main() {
  const values = await readEnvValues(rootDir);
  const database = process.env.POSTGRES_DB || values.get("POSTGRES_DB");
  const user = process.env.POSTGRES_USER || values.get("POSTGRES_USER");
  if (!database || !user) {
    throw new Error("POSTGRES_DB and POSTGRES_USER must be set, in the environment or in the env file");
  }

  const runDump = async (target) => {
    const file = createWriteStream(target, { mode: 0o600 });
    await run("docker", ["exec", container, "pg_dump", "-U", user, "-d", database, "-Fc"], {
      onStdout: file,
    });
    // If the container needs a password, swap the call above for this one and
    // read POSTGRES_PASSWORD out of `values`; docker passes the variable
    // through from this process, so it never reaches the command line:
    //   await run("docker", ["exec", "-e", "PGPASSWORD", container, "pg_dump", ...], {
    //     onStdout: file,
    //     env: { ...process.env, PGPASSWORD: values.get("POSTGRES_PASSWORD") },
    //   });
  };

  // The container cannot see the host's backup directory, and pg_restore wants
  // a seekable archive rather than a pipe, so the file goes in for the check.
  const verifyDump = async (target) => {
    const inside = `/tmp/${path.basename(target)}`;
    await run("docker", ["cp", target, `${container}:${inside}`]);
    try {
      await run("docker", ["exec", container, "pg_restore", "--list", inside]);
    } finally {
      await run("docker", ["exec", container, "rm", "-f", inside]).catch(() => {});
    }
  };

  const result = await createBackup({ backupDir, runDump, verifyDump, keep });
  const removed = result.removed.length ? `, removed ${result.removed.length}` : "";
  console.log(`backup ok: ${result.path}${removed}`);
}

main().catch((error) => {
  console.error(`backup failed: ${error.message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Добавить npm-скрипт**

В `package.json`, в раздел `scripts`, после строки `"postgres:reset": ...` добавить:

```json
    "backup:db": "node scripts/backup-db.mjs",
```

- [ ] **Step 4: Проверить на живой базе локально**

```bash
npm run postgres:up
```

Дождаться, пока контейнер здоров:

```bash
docker inspect --format '{{.State.Health.Status}}' gata-league-postgres
```

Ожидается: `healthy`.

```bash
rm -rf /tmp/gata-backup-smoke && BACKUP_DIR=/tmp/gata-backup-smoke npm run backup:db
```

Ожидается строка вида `backup ok: /tmp/gata-backup-smoke/gata_league-20260822-...dump`.

```bash
ls -l /tmp/gata-backup-smoke
docker cp /tmp/gata-backup-smoke/*.dump gata-league-postgres:/tmp/check.dump && docker exec gata-league-postgres pg_restore --list /tmp/check.dump | head -5
```

Ожидается: ровно один файл с правами `-rw-------`, и `pg_restore --list` печатает содержимое архива.

- [ ] **Step 5: Проверить, что сбой не оставляет мусора**

```bash
rm -rf /tmp/gata-backup-fail && BACKUP_DIR=/tmp/gata-backup-fail POSTGRES_CONTAINER=no-such-container npm run backup:db; echo "код возврата: $?"
ls -A /tmp/gata-backup-fail
```

Ожидается: `backup failed: ...`, код возврата `1`, каталог пустой — ни `.dump`, ни `.partial`.

- [ ] **Step 6: Коммит**

```bash
git add scripts/backup-db.mjs package.json
git commit -m "feat(backup): add the nightly dump command"
```

---

## Task 5: Команда состояния бэкапов

Один вызов, отвечающий на вопрос «всё ли в порядке», чтобы не читать журналы. Оценка чистая и покрыта тестами; CLI только собирает данные и печатает.

**Files:**
- Create: `scripts/backup/status.mjs`
- Create: `scripts/backup-status.mjs`
- Modify: `package.json` (раздел `scripts`)
- Test: `test/backup-status.test.mjs`

**Interfaces:**
- Consumes: `isDumpName`, `parseDumpTimestamp`, `DEFAULT_KEEP` из `scripts/backup/rotation.mjs` (Task 2).
- Produces:
  - `STALE_AFTER_HOURS: number` (= 48).
  - `summarizeBackups(entries: Array<{name: string, size: number}>, options?: {now?: Date, staleAfterHours?: number, keep?: number}): {count: number, totalBytes: number, newest: {name: string, size: number}|null, ageHours: number|null, stale: boolean, overKeep: boolean}`.
  - Команда `npm run backup:status`, код возврата `1` при `stale === true` или неуспешном последнем запуске сервиса.

- [ ] **Step 1: Написать падающий тест**

Создать `test/backup-status.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { STALE_AFTER_HOURS, summarizeBackups } from "../scripts/backup/status.mjs";

const dump = (name, size = 4096) => ({ name, size });
const now = new Date("2026-08-22T12:00:00Z");

test("counts the dumps and adds up their size", () => {
  const summary = summarizeBackups([
    dump("gata_league-20260820-040000.dump", 1000),
    dump("gata_league-20260821-040000.dump", 2000),
    dump("gata_league-20260822-040000.dump", 3000),
  ], { now });

  assert.equal(summary.count, 3);
  assert.equal(summary.totalBytes, 6000);
  assert.equal(summary.newest.name, "gata_league-20260822-040000.dump");
});

test("reports the age of the newest dump in hours", () => {
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  assert.equal(summary.ageHours, 8);
  assert.equal(summary.stale, false);
});

test("calls the backups stale once the newest is older than the limit", () => {
  const summary = summarizeBackups([dump("gata_league-20260820-040000.dump")], { now });
  assert.equal(summary.ageHours, 56);
  assert.equal(summary.stale, true);
});

test("an empty directory is stale, not merely empty", () => {
  const summary = summarizeBackups([], { now });
  assert.equal(summary.count, 0);
  assert.equal(summary.newest, null);
  assert.equal(summary.ageHours, null);
  assert.equal(summary.stale, true);
});

test("ignores files that are not dumps", () => {
  const summary = summarizeBackups([
    dump("gata_league-20260822-040000.dump", 4096),
    dump("gata_league-20260822-050000.dump.partial", 99),
    dump("notes.txt", 10),
  ], { now });

  assert.equal(summary.count, 1);
  assert.equal(summary.totalBytes, 4096);
});

test("flags a directory holding more dumps than the retention limit", () => {
  const names = [15, 16, 17, 18, 19, 20, 21, 22]
    .map((day) => dump(`gata_league-202608${day}-040000.dump`));
  const summary = summarizeBackups(names, { now, keep: 7 });
  assert.equal(summary.overKeep, true);
  assert.equal(summarizeBackups(names.slice(1), { now, keep: 7 }).overKeep, false);
});

test("the staleness limit is two days", () => {
  assert.equal(STALE_AFTER_HOURS, 48);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/backup-status.test.mjs
```

Ожидается: падение с `ERR_MODULE_NOT_FOUND` — `scripts/backup/status.mjs` не существует.

- [ ] **Step 3: Реализовать оценку**

Создать `scripts/backup/status.mjs`:

```js
import { DEFAULT_KEEP, isDumpName, parseDumpTimestamp } from "./rotation.mjs";

// A nightly job may be delayed by a reboot or a randomised start, but two
// missed nights in a row means something is broken rather than late.
export const STALE_AFTER_HOURS = 48;

/**
 * @param {Array<{name: string, size: number}>} entries
 * @param {{now?: Date, staleAfterHours?: number, keep?: number}} [options]
 */
export function summarizeBackups(entries, options = {}) {
  const { now = new Date(), staleAfterHours = STALE_AFTER_HOURS, keep = DEFAULT_KEEP } = options;

  const dumps = entries
    .filter((entry) => isDumpName(entry.name))
    .sort((left, right) => (left.name < right.name ? -1 : 1));

  const newest = dumps.at(-1) ?? null;
  const ageHours = newest
    ? (now.getTime() - parseDumpTimestamp(newest.name).getTime()) / 3_600_000
    : null;

  return {
    count: dumps.length,
    totalBytes: dumps.reduce((total, entry) => total + entry.size, 0),
    newest,
    ageHours,
    stale: ageHours === null || ageHours > staleAfterHours,
    overKeep: dumps.length > keep,
  };
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/backup-status.test.mjs
```

Ожидается: `pass 7`, `fail 0`.

- [ ] **Step 5: Написать CLI**

Создать `scripts/backup-status.mjs`:

```js
#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { DEFAULT_KEEP } from "./backup/rotation.mjs";
import { summarizeBackups } from "./backup/status.mjs";

const run = promisify(execFile);
const backupDir = process.env.BACKUP_DIR || "/var/backups/bloodbowl-league";
const keep = Number(process.env.BACKUP_KEEP || DEFAULT_KEEP);
const unit = "bloodbowl-backup";

const megabytes = (bytes) => `${(bytes / 1_048_576).toFixed(1)} MB`;

async function readEntries() {
  let names = [];
  try {
    names = await fs.readdir(backupDir);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const entries = [];
  for (const name of names) {
    const stat = await fs.stat(path.join(backupDir, name));
    if (stat.isFile()) entries.push({ name, size: stat.size });
  }
  return entries;
}

// systemd is absent on development machines; its absence is not a failure of
// the backups, so it is reported rather than thrown.
async function readTimer() {
  try {
    const { stdout } = await run("systemctl", [
      "show", `${unit}.service`,
      "--property=Result", "--property=ExecMainStatus", "--property=ExecMainExitTimestamp",
    ]);
    const properties = new Map(
      stdout.trim().split("\n").map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
    );
    const { stdout: timers } = await run("systemctl", ["list-timers", `${unit}.timer`, "--no-pager", "--no-legend"]);
    return { properties, timers: timers.trim() };
  } catch {
    return null;
  }
}

async function main() {
  const entries = await readEntries();
  if (entries === null) {
    console.error(`backup directory ${backupDir} does not exist`);
    process.exitCode = 1;
    return;
  }

  const summary = summarizeBackups(entries, { keep });
  console.log(`directory: ${backupDir}`);
  console.log(`dumps:     ${summary.count} (keeping ${keep}), ${megabytes(summary.totalBytes)} total`);
  if (summary.newest) {
    console.log(`newest:    ${summary.newest.name}, ${megabytes(summary.newest.size)}, ${summary.ageHours.toFixed(1)} h ago`);
  } else {
    console.log("newest:    none");
  }

  const timer = await readTimer();
  if (timer) {
    console.log(`last run:  ${timer.properties.get("Result")} (exit ${timer.properties.get("ExecMainStatus")}) at ${timer.properties.get("ExecMainExitTimestamp") || "never"}`);
    console.log(`timer:     ${timer.timers || "not scheduled"}`);
  } else {
    console.log("last run:  unknown (systemctl unavailable)");
  }

  const problems = [];
  if (summary.stale) problems.push(`newest dump is older than allowed (${summary.ageHours === null ? "there are none" : `${summary.ageHours.toFixed(1)} h`})`);
  if (summary.overKeep) problems.push(`${summary.count} dumps kept, expected at most ${keep}`);
  if (timer && timer.properties.get("Result") && timer.properties.get("Result") !== "success") {
    problems.push(`last run result: ${timer.properties.get("Result")}`);
  }

  if (problems.length) {
    console.error(`\nNOT OK:\n- ${problems.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nOK");
}

main().catch((error) => {
  console.error(`backup status failed: ${error.message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Добавить npm-скрипт**

В `package.json`, сразу после `"backup:db"`, добавить:

```json
    "backup:status": "node scripts/backup-status.mjs",
```

- [ ] **Step 7: Проверить CLI на свежем и на протухшем наборе**

```bash
BACKUP_DIR=/tmp/gata-backup-smoke npm run backup:status; echo "код возврата: $?"
```

Ожидается: строки `directory` / `dumps` / `newest` / `last run`, затем `OK`, код возврата `0`.

```bash
rm -rf /tmp/gata-backup-stale && mkdir -p /tmp/gata-backup-stale
cp "$(ls -1 /tmp/gata-backup-smoke/*.dump | head -1)" /tmp/gata-backup-stale/gata_league-20200101-040000.dump
BACKUP_DIR=/tmp/gata-backup-stale npm run backup:status; echo "код возврата: $?"
```

Ожидается: `NOT OK` с указанием возраста, код возврата `1`.

- [ ] **Step 8: Прогнать все тесты и закоммитить**

```bash
npm test
```

Ожидается: все тесты проходят.

```bash
git add scripts/backup/status.mjs scripts/backup-status.mjs test/backup-status.test.mjs package.json
git commit -m "feat(backup): report whether the backups are current"
```

---

## Task 6: Юниты systemd и документация установки

**Files:**
- Create: `deploy/systemd/bloodbowl-backup.service`
- Create: `deploy/systemd/bloodbowl-backup.timer`
- Modify: `DEPLOYMENT.md` (новый раздел перед `## Security Notes (added 2026-08-19)`)

**Interfaces:**
- Consumes: `scripts/backup-db.mjs` (Task 4), `scripts/backup-status.mjs` (Task 5).
- Produces: юниты `bloodbowl-backup.service` и `bloodbowl-backup.timer`, готовые к подключению симлинками.

- [ ] **Step 1: Написать unit сервиса**

Создать `deploy/systemd/bloodbowl-backup.service`:

```ini
[Unit]
Description=Nightly gata_league database backup
Documentation=file:///opt/bloodbowl-league/DEPLOYMENT.md
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/bloodbowl-league
ExecStart=/usr/bin/env node /opt/bloodbowl-league/scripts/backup-db.mjs
# The dumps hold password hashes and player contacts. Nothing but root reads them.
UMask=0077
```

- [ ] **Step 2: Написать unit таймера**

Создать `deploy/systemd/bloodbowl-backup.timer`:

```ini
[Unit]
Description=Nightly gata_league database backup

[Timer]
# Fixed UTC: a local-time schedule would skip or repeat a run when the clocks change.
OnCalendar=*-*-* 04:00:00 UTC
# Catch up on a run missed while the server was down, rather than losing that night.
Persistent=true
RandomizedDelaySec=300
Unit=bloodbowl-backup.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: Проверить синтаксис юнитов локально**

```bash
grep -c "" deploy/systemd/bloodbowl-backup.service deploy/systemd/bloodbowl-backup.timer
```

Ожидается: непустые файлы (12 и 13 строк соответственно). Настоящая проверка `systemd-analyze verify` делается на сервере в задаче 7 — на macOS systemd нет.

- [ ] **Step 4: Дописать раздел в `DEPLOYMENT.md`**

Вставить перед строкой `## Security Notes (added 2026-08-19)`:

````markdown
## Database Backups

A systemd timer dumps the `gata_league` database every night and keeps the seven
most recent dumps. Backups live in `/var/backups/bloodbowl-league`, outside the
deploy directory: `/opt/bloodbowl-league` is served over HTTP and a dump holds
the same secrets the `.env` leak did — logins, password hashes, contacts.

What this covers and what it does not: it restores data lost to a bad delete, a
broken migration, or a dropped volume, as long as you notice within a week. It
does not survive losing the server itself — there is no offsite copy — and the
dumps are not encrypted.

### One-time server setup

```bash
install -d -m 700 -o root -g root /var/backups/bloodbowl-league
ln -sf /opt/bloodbowl-league/deploy/systemd/bloodbowl-backup.service /etc/systemd/system/bloodbowl-backup.service
ln -sf /opt/bloodbowl-league/deploy/systemd/bloodbowl-backup.timer /etc/systemd/system/bloodbowl-backup.timer
systemctl daemon-reload
systemd-analyze verify bloodbowl-backup.timer
systemctl enable --now bloodbowl-backup.timer
```

The units are symlinks into the repository so that an edit arrives with the next
deploy. Two things do not: systemd is not reloaded by the deploy workflow, and
neither is `docker compose` (same caveat as `docker-compose.yml`). After changing
a unit file, run `systemctl daemon-reload` on the server by hand.

`ExecStart` calls `node` through `/usr/bin/env`, which searches only systemd's
own PATH. If `systemctl start bloodbowl-backup.service` fails with status 203,
node is installed somewhere else (nvm, for example). Point systemd at it:

```bash
command -v node    # e.g. /root/.nvm/versions/node/v20.11.1/bin/node
mkdir -p /etc/systemd/system/bloodbowl-backup.service.d
printf '[Service]\nEnvironment=PATH=%s:/usr/local/bin:/usr/bin:/bin\n' "$(dirname "$(command -v node)")" \
  > /etc/systemd/system/bloodbowl-backup.service.d/node-path.conf
systemctl daemon-reload
```

The drop-in stays on the server: the node path is a property of this host, not
of the repository.

### Checking on the backups

```bash
cd /opt/bloodbowl-league && npm run backup:status
```

It prints how many dumps there are, how old the newest one is, and how the last
run ended — and exits non-zero if the newest dump is more than 48 hours old, if
there are more dumps than the retention limit, or if the last run failed. That
is the one command to run when you want to know whether backups are healthy.

To take a backup right now:

```bash
systemctl start bloodbowl-backup.service
journalctl -u bloodbowl-backup.service --since "10 minutes ago" --no-pager
```

Settings that can be overridden through the environment: `BACKUP_DIR`,
`BACKUP_KEEP`, `POSTGRES_CONTAINER`.
````

- [ ] **Step 5: Коммит**

```bash
git add deploy/systemd/bloodbowl-backup.service deploy/systemd/bloodbowl-backup.timer DEPLOYMENT.md
git commit -m "feat(backup): schedule the nightly dump with a systemd timer"
```

---

## Task 7: Установка на сервере и приёмка

Здесь ничего не пишется — здесь проверяется, что написанное работает на боевой машине. Каждый пункт подтверждается выводом команды, а не предположением.

**Files:** изменений в репозитории нет; работа идёт на `51.81.86.51` по ssh.

**Interfaces:**
- Consumes: всё из задач 1–6, уже влитое в `main` и приехавшее деплоем.

- [ ] **Step 1: Влить ветку и дождаться деплоя**

```bash
git push -u origin feature/nightly-db-backup
gh pr create --fill --base main
```

После мержа дождаться зелёного прогона `.github/workflows/deploy.yml` и убедиться, что код на сервере:

```bash
ssh root@51.81.86.51 'cd /opt/bloodbowl-league && git log --oneline -1 && ls scripts/backup-db.mjs deploy/systemd/'
```

Ожидается: последний коммит совпадает с `main`, оба скрипта и оба юнита на месте.

- [ ] **Step 2: Измерить место и размер дампа**

```bash
ssh root@51.81.86.51 'df -h /var && docker exec gata-league-postgres psql -U gata_admin -d gata_league -c "SELECT pg_size_pretty(pg_database_size(current_database()));"'
```

Ожидается: свободного места на `/var` заведомо больше, чем семь размеров базы. Записать оба числа в отчёт по задаче. Если база неожиданно велика (свободное место меньше десятикратного размера семи дампов) — остановиться и вернуться к решению о глубине хранения, а не ставить таймер.

- [ ] **Step 3: Проверить аутентификацию `pg_dump` на сервере**

```bash
ssh root@51.81.86.51 'docker exec gata-league-postgres pg_dump -U gata_admin -d gata_league --schema-only -f /dev/null && echo "БЕЗ ПАРОЛЯ РАБОТАЕТ"'
```

Ожидается: `БЕЗ ПАРОЛЯ РАБОТАЕТ`. Если нет — применить вариант с паролем из задачи 4 (шаг 1), закоммитить правку и вернуться к шагу 1.

- [ ] **Step 4: Установить каталог и юниты**

```bash
ssh root@51.81.86.51 'install -d -m 700 -o root -g root /var/backups/bloodbowl-league
ln -sf /opt/bloodbowl-league/deploy/systemd/bloodbowl-backup.service /etc/systemd/system/bloodbowl-backup.service
ln -sf /opt/bloodbowl-league/deploy/systemd/bloodbowl-backup.timer /etc/systemd/system/bloodbowl-backup.timer
systemctl daemon-reload
systemd-analyze verify bloodbowl-backup.timer && echo "ЮНИТЫ КОРРЕКТНЫ"'
```

Ожидается: `ЮНИТЫ КОРРЕКТНЫ` без предупреждений.

- [ ] **Step 5: Снять первый дамп вручную**

```bash
ssh root@51.81.86.51 'systemctl start bloodbowl-backup.service; systemctl status bloodbowl-backup.service --no-pager -l | head -20; ls -l /var/backups/bloodbowl-league'
```

Ожидается: статус `Deactivated successfully` / `status=0/SUCCESS`, в каталоге один файл `gata_league-<дата>-<время>.dump` с правами `-rw-------` и владельцем `root`.

Если статус `203/EXEC` — сработала оговорка про путь к `node`; применить drop-in из `DEPLOYMENT.md` и повторить шаг.

- [ ] **Step 6: Включить таймер и проверить расписание**

```bash
ssh root@51.81.86.51 'systemctl enable --now bloodbowl-backup.timer && systemctl list-timers bloodbowl-backup.timer --no-pager'
```

Ожидается: таймер активен, следующий запуск — ближайшие 04:00 UTC.

- [ ] **Step 7: Проверить ротацию, не дожидаясь восьми суток**

Подложить семь фальшивых дампов, датированных январём, снять восьмой по-настоящему и посмотреть, что уцелело:

```bash
ssh root@51.81.86.51 'cd /var/backups/bloodbowl-league
for d in 01 02 03 04 05 06 07; do cp "$(ls -1 *.dump | head -1)" "gata_league-202601${d}-040000.dump"; done
echo "до запуска: $(ls -1 *.dump | wc -l)"
systemctl start bloodbowl-backup.service
echo "после запуска: $(ls -1 *.dump | wc -l)"
ls -1 *.dump'
```

Ожидается: до запуска 8 файлов, после — ровно 7. Удаляются два самых старых по метке времени в имени, то есть `gata_league-20260101-040000.dump` и `gata_league-20260102-040000.dump`; оба настоящих дампа (снятый в шаге 5 и только что снятый) на месте.

Убрать фальшивые дампы, чтобы они не занимали места в семёрке ближайшие дни:

```bash
ssh root@51.81.86.51 'cd /var/backups/bloodbowl-league && rm -f gata_league-2026010*-040000.dump && ls -1 *.dump'
```

Ожидается: остаются только настоящие дампы, январских имён в выводе нет.

- [ ] **Step 8: Проверить, что дампы не раздаются по HTTP**

```bash
ssh root@51.81.86.51 'ls -1 /var/backups/bloodbowl-league/*.dump | head -1'
```

Взять имя файла из вывода и проверить снаружи, что ни через сам путь, ни через обход он не отдаётся:

```bash
for p in /var/backups/bloodbowl-league/ /backups/ "/../var/backups/bloodbowl-league/" ; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://bloodbowlyerevan.shitpostsoftware.com$p"
done
```

Ожидается: `404` для каждого пути. Дампы лежат вне корня раздачи, а `resolveStaticPath` пускает только четыре файла и четыре каталога — этот шаг подтверждает, что так и есть.

- [ ] **Step 9: Проверить команду состояния на сервере**

```bash
ssh root@51.81.86.51 'cd /opt/bloodbowl-league && npm run backup:status; echo "код возврата: $?"'
```

Ожидается: `OK`, код возврата `0`, число дампов 7, возраст свежайшего — меньше часа.

- [ ] **Step 10: Убедиться, что ночной запуск прошёл сам**

Через сутки после шага 6:

```bash
ssh root@51.81.86.51 'cd /opt/bloodbowl-league && npm run backup:status && journalctl -u bloodbowl-backup.service --since "36 hours ago" --no-pager | tail -20'
```

Ожидается: в каталоге есть дамп с ночной меткой (`04:0x` UTC), которого не было при ручной проверке; в журнале — успешный запуск, инициированный таймером.

- [ ] **Step 11: Записать результаты**

Дописать в раздел `## Database Backups` в `DEPLOYMENT.md`, перед подразделом `### Checking on the backups`:

```markdown
Installed on the server on <дата установки>: timer active, first dump taken by
hand, rotation confirmed to keep seven, first unattended nightly run confirmed
on <дата ночного запуска>. Database size at install: <размер>; seven dumps take
about <объём> of the <свободно> free on /var.
```

Заполнить угловые скобки настоящими числами из шагов 2, 5, 7 и 10 — плейсхолдеры в документе оставлять нельзя.

```bash
git add DEPLOYMENT.md
git commit -m "docs(backup): record the install and the first unattended run"
```

---

## Task 8: Восстановление — процедура и репетиция

Бэкап, который ни разу не разворачивали, — это надежда, а не бэкап. Пока этот шаг не сделан, работа не закончена.

**Files:**
- Modify: `DEPLOYMENT.md` (новый подраздел в `## Database Backups`)

**Interfaces:**
- Consumes: дампы, созданные в задаче 7.

- [ ] **Step 1: Провести репетицию на сервере**

Развернуть свежий дамп в отдельную базу, не трогая боевую:

```bash
ssh root@51.81.86.51 'set -e
DUMP=$(ls -1t /var/backups/bloodbowl-league/*.dump | head -1)
echo "проверяем $DUMP"
docker cp "$DUMP" gata-league-postgres:/tmp/restore-check.dump
docker exec gata-league-postgres createdb -U gata_admin gata_league_restore_check
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league_restore_check /tmp/restore-check.dump
'
```

Ожидается: команды отрабатывают без ошибок (`pg_restore` может напечатать предупреждения о владельце — это не ошибка).

- [ ] **Step 2: Сравнить содержимое с боевой базой**

```bash
ssh root@51.81.86.51 'for db in gata_league gata_league_restore_check; do
  echo "== $db"
  docker exec gata-league-postgres psql -U gata_admin -d "$db" -t -c "SELECT count(*) FROM users;"
  docker exec gata-league-postgres psql -U gata_admin -d "$db" -t -c "SELECT count(*) FROM pg_stat_user_tables;"
done'
```

(`pg_stat_user_tables` вместо запроса к `information_schema` — чтобы обойтись без строковых литералов: одинарные кавычки внутри команды, идущей через `ssh`, разбираются дважды и ломаются.)

Ожидается: число пользователей и число таблиц совпадают (расхождение в пользователях допустимо только если кто-то зарегистрировался после снятия дампа — тогда в восстановленной базе их на столько же меньше, и это надо явно отметить).

- [ ] **Step 3: Убрать проверочную базу**

```bash
ssh root@51.81.86.51 'docker exec gata-league-postgres dropdb -U gata_admin gata_league_restore_check && docker exec gata-league-postgres rm -f /tmp/restore-check.dump && docker exec gata-league-postgres psql -U gata_admin -d gata_league -c "\l" | grep -c restore_check'
```

Ожидается: `0` — проверочной базы больше нет.

- [ ] **Step 4: Записать процедуру в `DEPLOYMENT.md`**

Дописать в конец раздела `## Database Backups`:

````markdown
### Restoring from a backup

Rehearsed on <дата>: the newest dump restored into a scratch database, row and
table counts matched production, scratch database dropped.

**Checking a dump without touching production** — do this, not the destructive
path, whenever the question is "is this backup any good":

```bash
DUMP=$(ls -1t /var/backups/bloodbowl-league/*.dump | head -1)
docker cp "$DUMP" gata-league-postgres:/tmp/restore-check.dump
docker exec gata-league-postgres createdb -U gata_admin gata_league_restore_check
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league_restore_check /tmp/restore-check.dump
docker exec gata-league-postgres psql -U gata_admin -d gata_league_restore_check -c "SELECT count(*) FROM users;"
docker exec gata-league-postgres dropdb -U gata_admin gata_league_restore_check
docker exec gata-league-postgres rm -f /tmp/restore-check.dump
```

**Restoring over production.** This destroys whatever is in the database now,
including anything written since the dump was taken. Take a fresh dump first,
even if the current data looks broken — it is the only copy of the state you are
about to overwrite.

```bash
# 1. Stop the app so nothing writes mid-restore.
pm2 stop bloodbowl-league

# 2. Keep the current state, broken or not.
cd /opt/bloodbowl-league && BACKUP_DIR=/var/backups/bloodbowl-league npm run backup:db

# 3. Pick the dump to restore and put it where the container can read it.
DUMP=/var/backups/bloodbowl-league/gata_league-YYYYMMDD-HHMMSS.dump
docker cp "$DUMP" gata-league-postgres:/tmp/restore.dump

# 4. Restore, replacing the existing objects.
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league --clean --if-exists /tmp/restore.dump
docker exec gata-league-postgres rm -f /tmp/restore.dump

# 5. Start the app and check it came back.
pm2 start bloodbowl-league
pm2 logs bloodbowl-league --lines 20 --nostream
curl -f https://bloodbowlyerevan.shitpostsoftware.com/api/health
```

`admin account is ready` in the log means the app reconnected and rewrote the
admin hash from the env file. Then open the site, log in, and confirm the data
you expected to get back is actually there.
````

Заполнить `<дата>` реальной датой репетиции.

- [ ] **Step 5: Финальная проверка и коммит**

```bash
npm test
```

Ожидается: все тесты проходят.

```bash
grep -n "TODO\|TBD\|YYYYMMDD-HHMMSS\|<дата\|<размер\|<объём\|<свободно" DEPLOYMENT.md
```

Ожидается: единственное совпадение — строка-образец `gata_league-YYYYMMDD-HHMMSS.dump` в блоке восстановления (там это шаблон имени, который оператор подставляет сам). Любое другое совпадение — незаполненный плейсхолдер, его надо заполнить.

```bash
git add DEPLOYMENT.md
git commit -m "docs(backup): document restoring, rehearsed against the newest dump"
```

---

## Приёмка целиком

Работа считается законченной, когда каждая строка подтверждена выводом команды:

| Критерий | Где проверяется |
|---|---|
| `npm test` зелёный, покрыты именование, ротация, атомарность и оценка свежести | задачи 2, 3, 5 |
| Ручной запуск снимает читаемый дамп | задача 7, шаг 5 |
| Сбой не оставляет ни `.dump`, ни `.partial` | задача 4, шаг 5 |
| Таймер активен и запланирован на 04:00 UTC | задача 7, шаг 6 |
| Ночной запуск отработал без участия человека | задача 7, шаг 10 |
| В каталоге остаётся ровно 7 дампов | задача 7, шаг 7 |
| Права `0700` на каталоге, `0600` на файлах, владелец `root` | задача 7, шаг 5 |
| Дампы не отдаются по HTTP | задача 7, шаг 8 |
| `npm run backup:status` полезен и падает на протухшем наборе | задача 5, шаг 7; задача 7, шаг 9 |
| Восстановление проверено на живом дампе | задача 8, шаги 1–3 |
| Документация без плейсхолдеров | задача 8, шаг 5 |

## Чего в этом плане нет намеренно

Ни offsite-копии, ни шифрования дампов, ни архива WAL, ни уведомлений, ни разной глубины хранения для дневных и недельных копий, ни изменений в `docker-compose.yml`, ни строк интерфейса. Всё это перечислено в разделе 9 спеки как сознательно отложенное. Если по ходу работы кажется, что без чего-то из списка не обойтись, — это повод вернуться к спеке и обсудить, а не расширять объём молча.

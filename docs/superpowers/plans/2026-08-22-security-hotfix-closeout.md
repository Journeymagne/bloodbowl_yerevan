# План закрытия инцидента с утечкой `.env`

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК — используйте
> superpowers:subagent-driven-development (рекомендуется) или
> superpowers:executing-plans для выполнения задач по одной. Шаги размечены
> чекбоксами (`- [ ]`).
>
> **Важно:** задачи 1–6 (часть A) выполняет **владелец лиги вручную по SSH**.
> У агента нет и не будет доступа к `51.81.86.51`. Роль агента в части A —
> выдавать блоки команд по одному, принимать вывод, сверять с ожидаемым и вести
> чеклист. Задачи 7–11 (часть B) — обычная работа с кодом в репозитории, её
> агент делает сам, кроме шагов, помеченных «ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ».

**Цель:** закрыть открытый наружу порт Postgres, сменить утёкшие пароли, применить
security-заголовки, разобрать следы и вынести `.env` за пределы каталога, который
обслуживает веб-сервер.

**Подход:** сначала собираем улики, потом закрываем активную дыру, потом ротация,
потом гигиена. Часть A — операции на сервере. Часть B — правка кода с TDD, деплой и
миграция файла с секретами по схеме «скопировать → проверить → удалить».

**Стек:** Node 22 (`node:test`), Postgres 16 в Docker, pm2, Caddy в контейнере
`paint-day-caddy`, GitHub Actions для деплоя.

**Спека:** [`docs/superpowers/specs/2026-08-22-security-hotfix-design.md`](../specs/2026-08-22-security-hotfix-design.md)

## Глобальные ограничения

- Часть A выполняется целиком до части B.
- Пароли генерирует и вводит владелец лиги. Агент их не видит, не просит и не
  записывает в файлы, логи и коммиты.
- Каталог инцидента — `/root/bb-incident-2026-08-22/`, права `700`.
- Пуш в `main` запускает деплой в продакшн. Мерж — только по явному
  подтверждению владельца, запрошенному отдельным сообщением.
- Имена контейнеров: `gata-league-postgres` (база), `paint-day-caddy` (общий Caddy).
- **Вход на сервер — под пользователем `ubuntu`, команды через `sudo`.** Перенаправление
  `>` выполняет шелл вызывающего пользователя, а не `sudo`, поэтому
  `sudo cmd > /root/файл` падает с `Permission denied`. Везде, где вывод пишется в
  `/root`, команда заворачивается в `sudo sh -c '...'`. Чтение из `/root` и
  `/home/deploy` тоже требует `sudo` — каталог инцидента создан с правами `700`.
- Приложение: pm2-процесс `bloodbowl-league`, слушает `3002`, снаружи закрыт.
- `refactor/stage-1` не трогаем.
- Новых строк интерфейса в этой работе нет, `src/i18n/*.json` не меняются.

## Карта файлов (часть B)

| Файл | Ответственность |
|---|---|
| `server/config/env-file.mjs` (создать) | Чистая функция `resolveEnvFilePath` — где искать файл с секретами. Логики загрузки не содержит. |
| `test/env-file.test.mjs` (создать) | Тесты на порядок поиска. Без обращений к настоящей файловой системе. |
| `server/server.mjs` (правка, строки 8–33) | `loadEnvFile()` берёт путь из `resolveEnvFilePath` вместо жёсткого `<корень>/.env`. Разбор строк не меняется. |
| `package.json` (правка) | Скрипт `test`. |
| `docker-compose.yml` (правка) | Убрать `env_file`, сделать переменные обязательными. |
| `DEPLOYMENT.md`, `README.md` (правка) | Новое расположение `.env`, права, `--env-file`, исправленная процедура ротации. |

---

# Часть A — сервер

### Задача 1: Фаза 0 — бэкап и снимок состояния

**Где:** SSH на `51.81.86.51` под `root`.

**Зачем:** всё, что дальше, меняет состояние. Без дампа и копии `.env` откатываться
не на что.

- [ ] **Шаг 1: создать каталог инцидента**

```bash
sudo install -d -m 700 /root/bb-incident-2026-08-22
```

Вывод пустой. Проверка — следующий шаг.

- [ ] **Шаг 2: сохранить копию `.env`**

```bash
sudo install -m 600 /opt/bloodbowl-league/.env /root/bb-incident-2026-08-22/env.bak
```

Ожидается: пустой вывод. Если `install` ругается на отсутствие исходного файла —
остановиться и сообщить: значит `.env` лежит не там, где предполагает план, и все
дальнейшие пути надо пересматривать.

- [ ] **Шаг 3: снять дамп базы**

```bash
sudo sh -c 'docker exec gata-league-postgres pg_dump -U gata_admin -d gata_league > /root/bb-incident-2026-08-22/gata_league.sql'
```

Ожидается: пустой вывод (дамп уходит в файл). Если появится
`FATAL: password authentication failed` — значит в контейнере не действует
доверие для локального сокета; тогда выполнить то же самое, добавив пароль из
`.env` через окружение:
`docker exec -e PGPASSWORD='<текущий POSTGRES_PASSWORD>' gata-league-postgres pg_dump -U gata_admin -d gata_league > /root/bb-incident-2026-08-22/gata_league.sql`

- [ ] **Шаг 4: проверить, что дамп настоящий**

```bash
sudo chmod 600 /root/bb-incident-2026-08-22/gata_league.sql && sudo ls -l /root/bb-incident-2026-08-22/ && sudo tail -5 /root/bb-incident-2026-08-22/gata_league.sql
```

Ожидается: `gata_league.sql` размером заметно больше нуля, права `-rw-------`, и среди
последних строк — `-- PostgreSQL database dump complete`.

Смотреть надо именно последние **пять** строк, а не одну: `pg_dump` заканчивает вывод
комментарным блоком и пустой строкой, поэтому `tail -1` вернёт пустоту даже для
совершенно исправного дампа. `chmod` здесь потому, что перенаправление внутри
`sudo sh -c` создаёт файл по umask root — `644`, то есть полный дамп базы читается
любым пользователем хоста. Каталог `700` его прикрывает, но слой лишним не будет.

Если маркера нет и вместо него оборванный SQL посреди `COPY` или `INSERT` — дамп
негодный, повторить шаг 3. На нём держится откат задач 3 и 4.

- [ ] **Шаг 5: вернуть вывод агенту**

Скопировать вывод шага 4 в чат. Агент отмечает задачу 1 выполненной и выдаёт задачу 2.

---

### Задача 2: Фаза 1 — сбор улик (гейт)

**Зачем:** `docker compose up -d` в задаче 3 пересоздаёт контейнер Postgres, и логи
старого контейнера исчезают вместе с ним. Всё, что может пропасть, собираем сейчас.

**Это гейт.** Условия остановки — в шаге 9.

- [ ] **Шаг 1: сохранить логи Caddy целиком**

```bash
sudo sh -c 'docker logs paint-day-caddy > /root/bb-incident-2026-08-22/caddy.log 2>&1'; sudo wc -l /root/bb-incident-2026-08-22/caddy.log
```

Ожидается: число строк. Если строк ноль — переходить к шагу 3, но зафиксировать это:
логов нет, значит по ним ничего сказать нельзя.

- [ ] **Шаг 2: проверить, включено ли вообще логирование запросов**

```bash
sudo grep -cE '"msg":"handled request"' /root/bb-incident-2026-08-22/caddy.log; sudo grep -nE '^[[:space:]]*log[[:space:]]*\{|^[[:space:]]*log$' /home/deploy/painting-evenings/Caddyfile
```

Ожидается одно из двух:
- ненулевое число и/или строка с директивой `log` — access-лог ведётся, шагу 3 можно
  верить;
- `0` и пустой вывод `grep` по Caddyfile — **access-лог не включён**. Caddy по
  умолчанию запросы не логирует. Тогда отсутствие записей о `/.env` не значит ничего,
  и в отчёте это пишется прямо, а не как «следов не найдено».

- [ ] **Шаг 3: искать обращения к секретным путям**

```bash
sudo grep -Ei '/\.env|/\.git|/docker-compose|/package\.json' /root/bb-incident-2026-08-22/caddy.log | tail -50
```

Ожидается: либо пусто, либо строки с полями `"uri"` и `"status"`. Ключевое различие:
`"status":404` — запрос был отбит (после 2026-08-21 09:55 UTC так и должно быть, это
обычный шум сканеров); `"status":200` — файл **был отдан**, и это уже подтверждённая
утечка.

- [ ] **Шаг 4: отдельно выделить успешные отдачи**

```bash
sudo grep -E '/\.env|/\.git' /root/bb-incident-2026-08-22/caddy.log | grep -E '"status":(200|206)' | tail -20
```

Ожидается: пусто. Любая строка здесь — срабатывание гейта.

- [ ] **Шаг 5: сохранить логи Postgres (исчезнут в задаче 3)**

```bash
sudo sh -c 'docker logs gata-league-postgres > /root/bb-incident-2026-08-22/postgres.log 2>&1'; sudo grep -ciE 'authentication failed|FATAL' /root/bb-incident-2026-08-22/postgres.log
```

Ожидается: число. Оговорка для отчёта: `log_connections` в образе `postgres:16` по
умолчанию выключен, поэтому **отсутствие** записей об успешных подключениях не
является доказательством того, что их не было. Видны будут в основном неудачные
попытки.

- [ ] **Шаг 6: посмотреть SSH-ключи и входы**

```bash
sudo cat /root/.ssh/authorized_keys; echo "--- ubuntu ---"; cat ~/.ssh/authorized_keys; echo "--- входы ---"; last -n 30
```

Хост доступен только владельцу, поэтому это не гейт, а тридцатисекундный взгляд:
находка здесь означала бы отдельный инцидент с другой причиной.

- [ ] **Шаг 7: список администраторов приложения**

```bash
sudo docker exec gata-league-postgres psql -U gata_admin -d gata_league -c "SELECT login, is_admin, created_at, updated_at FROM users WHERE is_admin ORDER BY created_at;"
```

Ожидается: одна строка — `admin` (или значение `ADMIN_LOGIN` из `.env`). Любая
вторая строка — срабатывание гейта.

- [ ] **Шаг 8: роли и таблицы Postgres**

```bash
sudo docker exec gata-league-postgres psql -U gata_admin -d gata_league -c "\du" -c "\dt"
```

Ожидается: роли `gata_admin` и служебные; таблицы — те, что заводит
`server/init.sql`. Незнакомая роль или таблица — срабатывание гейта.

- [ ] **Шаг 9: гейт**

Остановиться и вернуть всё агенту **до** задачи 3, если верно хоть что-то:

- шаг 4 нашёл `"status":200` на `/.env` или `/.git`;
- шаг 7 нашёл неизвестного администратора;
- шаг 8 нашёл неизвестную роль или таблицу.

Тогда это не «закрыть дыру», а разбор компрометации: другой объём работ, план
переписывается. Если ничего не сработало — переходить к задаче 3.

- [ ] **Шаг 10: вернуть вывод агенту**

Скопировать вывод шагов 2, 4, 5, 7, 8 в чат.

---

### Задача 3: Фаза 2 — закрыть порт 5433

**Зачем:** `nc -z 51.81.86.51 5433` отвечает `succeeded`. Пароль к этой базе лежал в
открытом доступе. Это единственная активно эксплуатируемая дыра.

**Сломать сайт эта задача не может:** браузер → `443` (Caddy) → `172.18.0.1:3002`
(pm2-процесс на хосте) → `localhost:5433` (Postgres). Публичный интерфейс в цепочке
не участвует. Перестанет работать только прямое подключение `psql` снаружи.

**Откат:** вернуть в `ports:` строку без `127.0.0.1:` и повторить `docker compose up -d`.

- [ ] **Шаг 1: убедиться, что в файле на сервере нужная привязка**

```bash
grep -n -A4 'ports:' /opt/bloodbowl-league/docker-compose.yml
```

Ожидается строка:
`- "127.0.0.1:${POSTGRES_PORT:-5433}:5432"`

Если там `- "${POSTGRES_PORT:-5433}:5432"` без `127.0.0.1` — значит на сервере старый
код; выполнить `cd /opt/bloodbowl-league && git fetch origin main && git reset --hard origin/main`
и повторить шаг.

- [ ] **Шаг 2: применить**

```bash
cd /opt/bloodbowl-league && sudo docker compose up -d
```

Ожидается: `Recreating gata-league-postgres` / `Container gata-league-postgres Started`.

- [ ] **Шаг 3: проверить привязку изнутри хоста**

```bash
sudo ss -lntp | grep 5433
```

Ожидается: строка с `127.0.0.1:5433`. Если видно `0.0.0.0:5433` или `*:5433` —
контейнер не пересоздался, повторить шаг 2 с `docker compose up -d --force-recreate`.

- [ ] **Шаг 4: перезапустить приложение**

```bash
sudo pm2 restart bloodbowl-league
```

Ожидается: таблица pm2 со статусом `online`. Пул соединений переподключается к
пересозданной базе.

- [ ] **Шаг 5: проверить, что приложение живо**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/api/health
```

Ожидается: `200`.

- [ ] **Шаг 6: вернуть вывод агенту**

Агент проверяет снаружи: `nc -z 51.81.86.51 5433` должен получить отказ, а сайт —
остаться на `200`. Без этой внешней проверки задача не считается выполненной.

---

### Задача 4: Фаза 3 — ротация паролей

**Зачем:** `POSTGRES_PASSWORD` и `ADMIN_PASSWORD` были доступны по HTTP.

**Ключевой момент:** правка `POSTGRES_PASSWORD` в `.env` пароль роли **не меняет** —
том `gata_postgres_data` уже инициализирован, и образ применяет эту переменную только
при создании пустой базы. Меняем через `ALTER USER`.

**Откат:** восстановить `.env` из `/root/bb-incident-2026-08-22/env.bak` и вернуть
прежний пароль роли тем же `\password`.

- [ ] **Шаг 1: сгенерировать два пароля**

```bash
echo "postgres: $(openssl rand -hex 24)"; echo "admin:    $(openssl rand -hex 24)"
```

Hex выбран сознательно: он безопасен внутри `DATABASE_URL` и не требует
URL-кодирования. Сохранить оба в свой менеджер паролей. Агенту их не показывать.

- [ ] **Шаг 2: сменить пароль роли в базе**

```bash
sudo docker exec -it gata-league-postgres psql -U gata_admin -d gata_league
```

В открывшемся psql выполнить `\password gata_admin`, дважды ввести новый
postgres-пароль (ввод не отображается и не попадает ни в историю shell, ни в список
процессов), затем `\q`.

Ожидается: приглашение `gata_league=#`, затем два запроса пароля, затем выход без
ошибок.

- [ ] **Шаг 3: привести `.env` в соответствие**

```bash
sudo nano /opt/bloodbowl-league/.env
```

Заменить три значения:
- `POSTGRES_PASSWORD=` — новый postgres-пароль;
- `DATABASE_URL=postgres://gata_admin:НОВЫЙ_POSTGRES_ПАРОЛЬ@localhost:5433/gata_league`
  — тот же самый пароль внутри строки;
- `ADMIN_PASSWORD=` — новый admin-пароль.

Остальные строки не трогать.

- [ ] **Шаг 4: проверить, что пароли в двух местах совпали, не печатая их**

```bash
sudo grep -E '^POSTGRES_PASSWORD=' /opt/bloodbowl-league/.env | cut -d= -f2- > /tmp/.p1; sudo sed -nE 's#^DATABASE_URL=postgres://[^:]+:([^@]+)@.*#\1#p' /opt/bloodbowl-league/.env > /tmp/.p2; cmp -s /tmp/.p1 /tmp/.p2 && echo MATCH || echo MISMATCH; rm -f /tmp/.p1 /tmp/.p2
```

Ожидается: `MATCH`. При `MISMATCH` вернуться к шагу 3 — приложение с расхождением к
базе не подключится.

- [ ] **Шаг 5: применить**

```bash
cd /opt/bloodbowl-league && sudo docker compose up -d && pm2 restart bloodbowl-league
```

Ожидается: контейнер поднят, pm2-процесс `online`.

- [ ] **Шаг 6: убедиться, что приложение подключилось к базе**

```bash
sudo pm2 logs bloodbowl-league --lines 40 --nostream
```

Ожидается строка `admin account is ready: admin` (или ваш `ADMIN_LOGIN`). Строка
означает, что `ensureAdmin()` отработал — то есть подключение к базе состоялось и
пароль администратора перезаписан новым значением из `.env`.

При `password authentication failed for user "gata_admin"` — расхождение между
паролем роли и `DATABASE_URL`; повторить шаги 2–4.

- [ ] **Шаг 7: проверить API**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/api/health
```

Ожидается: `200`.

- [ ] **Шаг 8: проверить вход администратором**

Открыть `https://bloodbowlyerevan.shitpostsoftware.com`, войти под `ADMIN_LOGIN` с
новым admin-паролем.

Ожидается: вход проходит. Старый пароль больше не работает — это и есть смысл фазы.

Менять этот пароль через интерфейс сайта бесполезно: `ensureAdmin()`
([server/server.mjs:344](../../../server/server.mjs)) перезаписывает хеш значением из
`.env` при каждом старте процесса.

- [ ] **Шаг 9: вернуть вывод агенту**

Скопировать вывод шагов 4, 6, 7 и результат шага 8. Пароли не копировать.

---

### Задача 5: Фаза 4 — security-заголовки в Caddy

**Зачем:** заголовки описаны в репозитории (`deploy/caddy/...conf`), но на сервер не
применены. Caddy обслуживает несколько сайтов из одного файла, поэтому валидация до
перезагрузки здесь не формальность: синтаксическая ошибка положит и соседние сайты.

**Откат:** восстановить `Caddyfile` из `/root/bb-incident-2026-08-22/Caddyfile.bak`
и перезагрузить.

- [ ] **Шаг 1: узнать, где Caddyfile лежит внутри контейнера**

```bash
sudo docker inspect paint-day-caddy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

Ожидается строка вида `/home/deploy/painting-evenings/Caddyfile -> /etc/caddy/Caddyfile`.
Если путь внутри контейнера другой — использовать его в шагах 4 и 5 вместо
`/etc/caddy/Caddyfile`.

- [ ] **Шаг 2: сделать копию**

```bash
sudo cp /home/deploy/painting-evenings/Caddyfile /root/bb-incident-2026-08-22/Caddyfile.bak && sudo ls -l /root/bb-incident-2026-08-22/Caddyfile.bak
```

Ожидается: строка с непустым размером.

- [ ] **Шаг 3: заменить блок сайта**

```bash
sudo nano /home/deploy/painting-evenings/Caddyfile
```

Найти блок `bloodbowlyerevan.shitpostsoftware.com { ... }` и заменить его целиком на:

```
bloodbowlyerevan.shitpostsoftware.com {
    header {
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        # Report-only first: index.html still has an inline theme script, so a
        # blocking policy would break the page until that script moves out.
        Content-Security-Policy-Report-Only "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        -Server
    }
    reverse_proxy 172.18.0.1:3002
}
```

Блоки других сайтов не трогать. Если в текущем блоке есть директивы, которых нет
выше (например `log` или `encode`), — сохранить их внутри нового блока.

- [ ] **Шаг 4: проверить синтаксис до перезагрузки**

```bash
sudo docker exec paint-day-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ожидается: `Valid configuration`. При ошибке — **не перезагружать**, вернуть текст
ошибки агенту; при необходимости восстановить копию:
`cp /root/bb-incident-2026-08-22/Caddyfile.bak /home/deploy/painting-evenings/Caddyfile`

- [ ] **Шаг 5: перезагрузить**

```bash
sudo docker exec paint-day-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ожидается: пустой вывод или сообщение об успешной перезагрузке, без ошибок.

- [ ] **Шаг 6: проверить, что соседний сайт жив**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://paint.shitpostsoftware.com/
```

Ожидается: `200` (или тот код, который этот сайт отдавал раньше). Смысл шага — убедиться,
что правка общего файла не задела соседей.

- [ ] **Шаг 7: вернуть вывод агенту**

Агент проверяет заголовки снаружи.

---

### Задача 6: Фаза 5 — внешняя приёмка

**Кто выполняет:** агент, со своей машины. Смысл — проверка независимая от того, что
сервер сообщает о себе сам.

- [ ] **Шаг 1: секретные пути закрыты**

```bash
for p in /.env /.git/config /package.json /server/init.sql /docker-compose.yml; do printf "%-22s -> " "$p"; curl -s -m 10 -o /dev/null -w "%{http_code}\n" "https://bloodbowlyerevan.shitpostsoftware.com$p"; done
```

Ожидается: `404` во всех пяти строках.

- [ ] **Шаг 2: сайт жив**

```bash
for p in / /src/app.js /public/data.en.json /api/health; do printf "%-22s -> " "$p"; curl -s -m 10 -o /dev/null -w "%{http_code}\n" "https://bloodbowlyerevan.shitpostsoftware.com$p"; done
```

Ожидается: `200` во всех четырёх строках.

- [ ] **Шаг 3: порт базы закрыт снаружи**

```bash
nc -z -G 8 -w 8 -v 51.81.86.51 5433 2>&1 | tail -2
```

Ожидается: отказ в соединении или таймаут. `succeeded` означает, что задача 3 не
достигла цели.

- [ ] **Шаг 4: заголовки на месте**

```bash
curl -sI -m 10 https://bloodbowlyerevan.shitpostsoftware.com/ | grep -iE 'x-content-type-options|referrer-policy|permissions-policy|content-security-policy|^server'
```

Ожидается: четыре заголовка присутствуют, строки `Server:` нет.

- [ ] **Шаг 5: записать результат**

Зафиксировать фактический вывод всех четырёх шагов. Пункт, который не проверен,
записывается как непроверенный — без формулировок «должно работать».

---

# Часть B — код и миграция `.env`

### Задача 7: `resolveEnvFilePath` и переход `loadEnvFile` на неё

**Файлы:**
- Создать: `server/config/env-file.mjs`
- Создать: `test/env-file.test.mjs`
- Правка: `server/server.mjs` (импорты, строки 1–33)
- Правка: `package.json` (секция `scripts`)

**Интерфейсы:**
- Использует: ничего из предыдущих задач.
- Предоставляет: `resolveEnvFilePath(rootDir: string, options?: { override?: string, systemPath?: string, exists?: (path: string) => boolean }): string | null`
  и константу `SYSTEM_ENV_PATH = "/etc/bloodbowl-league/.env"`.

**Ветка:** работать в `security/hotfix-closeout` (уже создана, в ней лежит спека).

- [ ] **Шаг 1: добавить скрипт запуска тестов**

В `package.json`, в секцию `scripts`, первой строкой:

```json
    "test": "node --test test/",
```

Скрипта `test` в проекте нет, хотя `DEPLOYMENT.md` на `npm test` уже ссылается.

- [ ] **Шаг 2: написать падающий тест**

Создать `test/env-file.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveEnvFilePath, SYSTEM_ENV_PATH } from "../server/config/env-file.mjs";

const root = "/opt/bloodbowl-league";
const existing = (...paths) => (candidate) => paths.includes(candidate);

test("prefers the system path over the deploy directory", () => {
  const resolved = resolveEnvFilePath(root, {
    override: null,
    exists: existing(SYSTEM_ENV_PATH, path.join(root, ".env")),
  });
  assert.equal(resolved, SYSTEM_ENV_PATH);
});

test("falls back to the deploy directory when the system path is absent", () => {
  const resolved = resolveEnvFilePath(root, {
    override: null,
    exists: existing(path.join(root, ".env")),
  });
  assert.equal(resolved, path.join(root, ".env"));
});

test("returns null when no candidate exists", () => {
  const resolved = resolveEnvFilePath(root, {
    override: null,
    exists: existing(),
  });
  assert.equal(resolved, null);
});

test("an explicit override wins over both defaults", () => {
  const override = "/srv/secrets/bloodbowl.env";
  const resolved = resolveEnvFilePath(root, {
    override,
    exists: existing(override, SYSTEM_ENV_PATH, path.join(root, ".env")),
  });
  assert.equal(resolved, override);
});

test("resolves a relative override to an absolute path", () => {
  const resolved = resolveEnvFilePath(root, {
    override: "secrets/.env",
    exists: existing(path.resolve("secrets/.env")),
  });
  assert.equal(resolved, path.resolve("secrets/.env"));
});

test("throws when the override points at a file that does not exist", () => {
  assert.throws(
    () => resolveEnvFilePath(root, {
      override: "/srv/secrets/missing.env",
      exists: existing(SYSTEM_ENV_PATH, path.join(root, ".env")),
    }),
    /BLOODBOWL_ENV_FILE/,
  );
});
```

`override: null` в тестах передаётся намеренно: значение по умолчанию при
деструктуризации подставляется только для `undefined`, поэтому `undefined` заставил бы
модуль прочитать настоящий `process.env.BLOODBOWL_ENV_FILE` и тесты зависели бы от
окружения машины. `null` проходит насквозь и глушит эту ветку.

Последний тест фиксирует решение: явное переопределение, указывающее на
несуществующий файл, — это ошибка, а не повод молча взять другой файл с секретами.
Тихий фолбэк здесь означал бы запуск с чужим набором паролей.

- [ ] **Шаг 3: убедиться, что тесты падают**

```bash
npm test
```

Ожидается: падение с `Cannot find module` для `../server/config/env-file.mjs`.

- [ ] **Шаг 4: написать модуль**

Создать `server/config/env-file.mjs`:

```javascript
import fs from "node:fs";
import path from "node:path";

// The deploy directory is served over HTTP, so the file that holds the database
// and admin passwords must not live there. Production keeps it in /etc; the
// repository-root path stays as a fallback so local development keeps working
// on machines that have no /etc/bloodbowl-league.
export const SYSTEM_ENV_PATH = "/etc/bloodbowl-league/.env";

export function resolveEnvFilePath(rootDir, options = {}) {
  const {
    override = process.env.BLOODBOWL_ENV_FILE,
    systemPath = SYSTEM_ENV_PATH,
    exists = (candidate) => fs.existsSync(candidate),
  } = options;

  if (override) {
    const resolved = path.resolve(override);
    if (!exists(resolved)) {
      throw new Error(`BLOODBOWL_ENV_FILE points at ${resolved}, which does not exist`);
    }
    return resolved;
  }

  for (const candidate of [systemPath, path.join(rootDir, ".env")]) {
    if (exists(candidate)) return candidate;
  }

  return null;
}
```

- [ ] **Шаг 5: убедиться, что тесты проходят**

```bash
npm test
```

Ожидается: `pass 6`, `fail 0` по файлу `env-file.test.mjs`, и по-прежнему зелёный
`static-path.test.mjs`.

- [ ] **Шаг 6: перевести `loadEnvFile` на новую функцию**

В `server/server.mjs` добавить импорт рядом с существующим импортом
`resolveStaticPath` (строка 8):

```javascript
import { resolveEnvFilePath } from "./config/env-file.mjs";
```

и заменить первые строки `loadEnvFile` (строки 12–15) так, чтобы функция начиналась с:

```javascript
async function loadEnvFile() {
  const envPath = resolveEnvFilePath(rootDir);
  if (!envPath) return;
  let body = "";
  try {
    body = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }
```

Остальное тело функции — разбор строк и присваивание в `process.env` — не меняется,
включая правило «переменная из реального окружения важнее значения из файла».

- [ ] **Шаг 7: проверить, что сервер стартует локально**

```bash
node -e "import('./server/config/env-file.mjs').then(m => console.log(m.resolveEnvFilePath(process.cwd())))"
```

Ожидается: путь к локальному `.env`, если он есть в корне репозитория, иначе `null`.
Ошибок быть не должно.

- [ ] **Шаг 8: прогнать полный набор проверок**

```bash
npm test && npm run build && npm run i18n:check
```

Ожидается: тесты зелёные, сборка проходит, `i18n:check` показывает одинаковое число
страниц для обеих локалей и `0 fallbacks`.

- [ ] **Шаг 9: коммит**

```bash
git add server/config/env-file.mjs test/env-file.test.mjs server/server.mjs package.json && git commit -m "feat(config): look for .env outside the served directory first"
```

---

### Задача 8: `docker-compose.yml` — убрать `env_file`, сделать переменные обязательными

**Файлы:**
- Правка: `docker-compose.yml`

**Интерфейсы:**
- Использует: ничего.
- Предоставляет: на сервере команда становится
  `docker compose --env-file /etc/bloodbowl-league/.env up -d` — это используется в задаче 11.

- [ ] **Шаг 1: правка файла**

Заменить блок `env_file` и `environment` так, чтобы стало:

```yaml
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?POSTGRES_DB is required}
      POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER is required}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
```

Строки

```yaml
    env_file:
      - .env
```

удалить целиком: контейнеру не нужен весь файл с секретами, ему достаточно этих трёх
переменных.

Сейчас при отсутствии `POSTGRES_PASSWORD` compose молча поднимает базу с паролем
`change-me-admin-password`. Это отказ, который невозможно заметить глазами. После
правки compose падает с внятным сообщением.

- [ ] **Шаг 2: проверить, что локально ничего не сломалось**

```bash
docker compose config --quiet && echo OK
```

Ожидается: `OK`, если в корне репозитория есть `.env` (compose подхватывает его
автоматически для подстановки переменных). Если `.env` нет — ожидается ошибка
`POSTGRES_PASSWORD is required`, и это правильное поведение, а не поломка.

- [ ] **Шаг 3: коммит**

```bash
git add docker-compose.yml && git commit -m "chore(compose): require the database variables instead of defaulting them"
```

---

### Задача 9: документация

**Файлы:**
- Правка: `DEPLOYMENT.md`
- Правка: `README.md`

- [ ] **Шаг 1: исправить процедуру ротации в `DEPLOYMENT.md`**

В разделе `## Security Notes (added 2026-08-19)` заменить подраздел про ротацию так,
чтобы он описывал реальную процедуру:

````markdown
**Rotating the leaked credentials**

Changing `POSTGRES_PASSWORD` in the env file does *not* change the role's password:
the `postgres:16` image applies that variable only when it initialises an empty data
directory, and the `gata_postgres_data` volume already holds a database. Change the
role inside Postgres first, then bring the env file in line:

```bash
sudo docker exec -it gata-league-postgres psql -U gata_admin -d gata_league
# \password gata_admin   (prompts twice, never echoes, never hits shell history)
# \q
```

Then edit `/etc/bloodbowl-league/.env`: `POSTGRES_PASSWORD`, the password inside
`DATABASE_URL` (it must match), and `ADMIN_PASSWORD`. Apply with:

```bash
cd /opt/bloodbowl-league
docker compose --env-file /etc/bloodbowl-league/.env up -d
pm2 restart bloodbowl-league
```

`ensureAdmin()` rewrites the admin password from the env file on every start, so
changing it through the site is pointless — the file is the source of truth.
````

- [ ] **Шаг 2: описать новое расположение файла в `DEPLOYMENT.md`**

В разделе `### One-time server setup` заменить строки про `cp .env.example .env` на:

````markdown
The file holding the passwords lives outside the directory the web server serves,
so a future routing change cannot expose it again:

```bash
install -d -m 700 /etc/bloodbowl-league
install -m 600 /opt/bloodbowl-league/.env.example /etc/bloodbowl-league/.env
# edit /etc/bloodbowl-league/.env: set a real POSTGRES_PASSWORD, put the same
# password inside DATABASE_URL, set ADMIN_PASSWORD and ADMIN_TELEGRAM, leave
# APP_PORT=3002
docker compose --env-file /etc/bloodbowl-league/.env up -d
```

The server looks for the file in this order: `BLOODBOWL_ENV_FILE`,
`/etc/bloodbowl-league/.env`, then `.env` in the repository root (which is what
local development uses). `docker compose` needs the path passed explicitly with
`--env-file`; without it the variables are missing and compose refuses to start
rather than falling back to the placeholder password.
````

- [ ] **Шаг 3: обновить раздел «Still to do»**

Удалить из `DEPLOYMENT.md` пункт про вынос `.env` — он выполнен. Пункт про перевод
CSP в блокирующий режим оставить.

- [ ] **Шаг 4: обновить `README.md`**

В разделе про локальный запуск (строки около 52 и 71) уточнить, что `.env` в корне
репозитория — путь для локальной разработки, а на сервере файл лежит в
`/etc/bloodbowl-league/.env`, и что порядок поиска задан в
`server/config/env-file.mjs`.

- [ ] **Шаг 5: проверить, что ничего не сломано**

```bash
npm test && npm run build && npm run i18n:check
```

Ожидается: всё зелёное.

- [ ] **Шаг 6: коммит**

```bash
git add DEPLOYMENT.md README.md && git commit -m "docs: document the env file's new home and the real rotation procedure"
```

---

### Задача 10: мерж и деплой — ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ

**Пуш в `main` запускает деплой в продакшн.** Агент не выполняет эту задачу без
явного слова владельца, запрошенного отдельным сообщением.

- [ ] **Шаг 1: показать владельцу, что уедет**

```bash
git log --oneline main..security/hotfix-closeout && git diff --stat main security/hotfix-closeout
```

- [ ] **Шаг 2: получить подтверждение**

Спросить владельца прямым вопросом и дождаться ответа. Без ответа — не продолжать.

- [ ] **Шаг 3: влить и запушить**

```bash
git checkout main && git merge --no-ff security/hotfix-closeout && git push origin main
```

- [ ] **Шаг 4: дождаться деплоя**

```bash
gh run list --limit 1
```

Ожидается: `completed  success  ...  Deploy  main  push`.

- [ ] **Шаг 5: проверить, что сайт жив после деплоя**

```bash
for p in / /src/app.js /api/health; do printf "%-14s -> " "$p"; curl -s -m 10 -o /dev/null -w "%{http_code}\n" "https://bloodbowlyerevan.shitpostsoftware.com$p"; done
```

Ожидается: `200` во всех строках. На этом этапе `.env` всё ещё лежит в
`/opt/bloodbowl-league` — код умеет оба расположения, поэтому деплой сам по себе
ничего не мигрирует.

---

### Задача 11: миграция `.env` на сервере

**Кто выполняет:** владелец по SSH, после успешного деплоя задачи 10.

**Принцип:** копируем → проверяем → и только потом удаляем. Ни в один момент времени
конфига нет ни по одному из путей.

**Откат на шагах 1–4:** ничего не делать, старый файл на месте, система работает с него.

- [ ] **Шаг 1: создать каталог**

```bash
sudo install -d -m 700 /etc/bloodbowl-league
```

- [ ] **Шаг 2: скопировать файл**

```bash
sudo install -m 600 -o root -g root /opt/bloodbowl-league/.env /etc/bloodbowl-league/.env && sudo ls -l /etc/bloodbowl-league/.env
```

Ожидается: `-rw------- 1 root root ... /etc/bloodbowl-league/.env`.

- [ ] **Шаг 3: перезапустить приложение и убедиться, что читается новый файл**

```bash
sudo pm2 restart bloodbowl-league && sleep 3 && pm2 logs bloodbowl-league --lines 20 --nostream
```

Ожидается: `admin account is ready`. Приложение теперь читает
`/etc/bloodbowl-league/.env` — он идёт раньше в порядке поиска, — а старый файл ещё
лежит на месте как страховка.

- [ ] **Шаг 4: перевести Postgres на `--env-file`**

```bash
cd /opt/bloodbowl-league && sudo docker compose --env-file /etc/bloodbowl-league/.env up -d && docker compose ps
```

Ожидается: контейнер `gata-league-postgres` в состоянии `running` (или `healthy`).

- [ ] **Шаг 5: убедиться, что связка приложение — база работает**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/api/health
```

Ожидается: `200`. Пока не получен `200` — шаг 6 не выполнять.

- [ ] **Шаг 6: удалить старый файл**

```bash
sudo rm /opt/bloodbowl-league/.env && ls -la /opt/bloodbowl-league/ | grep -c '\.env$' || echo "файла нет — верно"
```

Ожидается: `.env` в каталоге отсутствует (`.env.example` остаётся, он не секретный).

- [ ] **Шаг 7: финальная проверка**

```bash
sudo pm2 restart bloodbowl-league && sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/api/health
```

Ожидается: `200`. Это подтверждает, что приложение живёт без файла в старом месте.

- [ ] **Шаг 8: агент проверяет снаружи**

```bash
printf "/.env -> "; curl -s -m 10 -o /dev/null -w "%{http_code}\n" "https://bloodbowlyerevan.shitpostsoftware.com/.env"; printf "/     -> "; curl -s -m 10 -o /dev/null -w "%{http_code}\n" "https://bloodbowlyerevan.shitpostsoftware.com/"
```

Ожидается: `404` и `200`. Теперь за белым списком путей ещё и пусто — защита в два
слоя вместо одного.

- [ ] **Шаг 9: закрыть работу**

Отметить в спеке (раздел 9, критерии готовности) фактическое состояние всех семи
пунктов с выводом команд. Пункт, который не проверен, помечается как непроверенный.

---

## Критерии готовности плана

Работа завершена, когда одновременно верно:

1. `/.env`, `/.git/config`, `/package.json`, `/server/init.sql`, `/docker-compose.yml` → `404`;
   `/`, `/src/app.js`, `/public/data.en.json`, `/api/health` → `200`.
2. `nc -z 51.81.86.51 5433` снаружи получает отказ.
3. Пароль роли `gata_admin` и `ADMIN_PASSWORD` сменены, приложение подключается,
   вход администратора с новым паролем работает, со старым — нет.
4. Ответ содержит `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
   `Content-Security-Policy-Report-Only` и не содержит `Server`.
5. Логи проверены, результат зафиксирован — с явной оговоркой про выключенные
   `log_connections` и (если это так) отсутствующий access-лог Caddy.
6. `.env` отсутствует в `/opt/bloodbowl-league`, лежит в `/etc/bloodbowl-league/`
   с правами `600`, приложение и Postgres работают.
7. `npm test`, `npm run build`, `npm run i18n:check` проходят.

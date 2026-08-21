# Хотфикс безопасности: что осталось сделать на сервере

**Статус на 2026-08-21:** дыра в раздаче статики закрыта на бою, секреты — **нет**.
Пока не выполнены шаги 3–6, исходить надо из того, что пароли базы и
администратора скомпрометированы.

Этот документ — операционный чеклист для владельца лиги. Всё, что можно было
сделать кодом, уже в `main`; ниже только то, что требует SSH на сервер.

Подробности проблемы и её первопричины — раздел 14 документа
`docs/superpowers/specs/2026-08-19-app-refactor-design.md`.

---

## В чём была проблема

`resolveStaticPath` в `server/server.mjs` запрещала выход выше корня деплоя, но
не ограничивала выдачу каталогами статики. Всё, что лежало в `/opt/bloodbowl-league`,
было доступно по HTTP любому без авторизации:

| Запрос | Что отдавалось |
|---|---|
| `GET /.env` | `POSTGRES_PASSWORD`, `DATABASE_URL` с паролем, `ADMIN_LOGIN`, `ADMIN_PASSWORD` |
| `GET /.git/config`, `/.git/…` | вся история репозитория |
| `GET /server/server.mjs`, `/server/init.sql` | исходники и схема базы |
| `GET /docker-compose.yml`, `/package.json` | инфраструктурные файлы |

Расширение файла роли не играло: неизвестный тип отдавался как
`application/octet-stream`.

---

## Шаг 1 — выкатить фикс ✅ ВЫПОЛНЕНО

Коммит `5ff1952` («fix(security): serve only whitelisted static paths») в `main`,
деплой прошёл. `resolveStaticPath` переписана на белый список: разрешены
`index.html`, `local-preview.html` и содержимое `dist/`, `public/`, `src/`,
`assets/`. Всё остальное — `404` (именно 404, а не 403: 403 подтверждал бы
существование файла). Дополнительно запрещён любой сегмент пути, начинающийся с
точки, и символ `\`.

## Шаг 2 — проверить, что дыра закрылась ✅ ВЫПОЛНЕНО

Проверено 2026-08-21: `/.env`, `/.git/config`, `/package.json`,
`/server/init.sql`, `/docker-compose.yml` отдают `404`; `/`, `/index.html`,
`/src/app.js`, `/public/data.en.json`, `/api/health` отдают `200`.

Повторить при необходимости:

```bash
for p in /.env /.git/config /package.json /server/init.sql; do printf "%-22s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://bloodbowlyerevan.shitpostsoftware.com$p"; done
```

---

## Шаг 3 — сменить скомпрометированные секреты ⬜ ОСТАЛОСЬ

Файлы были открыты наружу неизвестно сколько времени, поэтому пароли меняются
независимо от того, найдутся ли следы обращений в логах.

На сервере `51.81.86.51` открыть `/opt/bloodbowl-league/.env` и заменить три
значения на новые:

- `POSTGRES_PASSWORD`
- `DATABASE_URL` — тот же новый пароль внутри строки
  `postgres://gata_admin:НОВЫЙ_ПАРОЛЬ@localhost:5433/gata_league`
- `ADMIN_PASSWORD`

**`POSTGRES_PASSWORD` и пароль внутри `DATABASE_URL` должны совпадать**, иначе
приложение не подключится к базе.

**Менять пароль администратора через интерфейс сайта бесполезно.** Функция
`ensureAdmin` в `server/server.mjs` при каждом старте перезаписывает пароль
администратора значением из `.env` (`ON CONFLICT … DO UPDATE SET password_hash`).
Менять надо именно файл.

Применить:

```bash
cd /opt/bloodbowl-league && docker compose up -d && pm2 restart bloodbowl-league
```

## Шаг 4 — закрыть порт базы снаружи ⬜ ОСТАЛОСЬ

`docker-compose.yml` в репозитории уже привязывает Postgres к `127.0.0.1`
(было `"${POSTGRES_PORT:-5433}:5432"`, то есть `0.0.0.0`). Команда
`docker compose up -d` из шага 3 применит это.

Проверить **с другой машины**, что порт снаружи не отвечает:

```bash
nc -zv 51.81.86.51 5433
```

Ожидается отказ в соединении.

## Шаг 5 — security-заголовки в Caddy ⬜ ОСТАЛОСЬ

Взять содержимое `deploy/caddy/bloodbowlyerevan.shitpostsoftware.com.conf` из
репозитория и заменить им блок `bloodbowlyerevan.shitpostsoftware.com { … }` в
общем Caddyfile по пути `/home/deploy/painting-evenings/Caddyfile`, затем
перезагрузить Caddy.

Добавляются `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` и `Content-Security-Policy` в режиме **Report-Only**.

CSP намеренно не блокирующая: в `index.html` есть инлайновый скрипт выбора
темы, при строгой политике страница сломается. Чтобы включить блокирующий
режим, этот скрипт надо сначала вынести в отдельный файл или подписать хэшем.

## Шаг 6 — проверить следы ⬜ ОСТАЛОСЬ

```bash
docker logs paint-day-caddy 2>&1 | grep -Ei '/\.env|/\.git'
```

Если обращения найдутся, дополнительно проверить:

```bash
cat ~/.ssh/authorized_keys
```

на чужие ключи, и список администраторов в базе:

```sql
SELECT login, is_admin, created_at FROM users WHERE is_admin;
```

## Шаг 7 — унести `.env` из каталога, который обслуживает сервер ⬜ ОСТАЛОСЬ

Не срочно, но правильно: перенести файл в `/etc/bloodbowl-league/.env` и
передавать переменные в pm2 через окружение. Тогда будущая правка роутинга не
сможет снова выставить секреты наружу — сейчас защита держится только на белом
списке из шага 1.

Требует правки `DEPLOYMENT.md` и того, как pm2 запускает процесс.

---

## Что уже сделано кодом и не требует действий

- Белый список путей в `resolveStaticPath` (`server/http/static-path.mjs`),
  покрыт восемью тестами в `test/static-path.test.mjs`.
- Привязка Postgres к `127.0.0.1` в `docker-compose.yml`.
- Конфиг Caddy с заголовками — лежит готовым в
  `deploy/caddy/bloodbowlyerevan.shitpostsoftware.com.conf`, но его надо
  применить вручную (шаг 5): этот файл в репозитории — снипет, а не рабочий
  конфиг, Caddy читает общий Caddyfile на сервере.

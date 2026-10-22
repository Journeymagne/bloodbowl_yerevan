# Deployment Handoff

This document is for the person who will publish the Gata Blood Bowl League reference site.

## Quick Deploy Checklist

1. Clone the repository.
2. Use the `gata-league` branch, or merge it into the branch you want to deploy.
3. Run `npm install`.
4. Run `npm run build`.
5. Confirm that `dist/` was generated.
6. Publish `dist/` on a static host.

## Updating Content

For small text/content edits:

1. Edit Markdown files in `content/Gata`.
2. Run `npm run build`.
3. Commit and push.

For a full re-import from the original Gata source files:

1. Put the latest source files into `source/`.
2. Run `npm run import:gata`.
3. Run `npm run build`.
4. Review changed Markdown under `content/Gata`.
5. Commit and push.

Default source file names:

```text
source/Gata League 2_ Info.xlsx
source/Gata League 2.0 ENG.docx
source/Gata League 2 Changelog ENG.docx
```

The importer also accepts environment variables:

```text
GATA_XLSX
GATA_RULES_DOCX
GATA_CHANGELOG_DOCX
```

## Smoke Test Before Publishing

Run:

```bash
npm run build
npm run dev
```

Open:

```text
http://localhost:5173
```

Check at least:

- Overview opens.
- Teams shows 37 cards.
- Star Players shows 75 cards.
- Skills shows 86 cards.
- Traits shows 38 cards.
- Team Builder can add a player and update cost.
- A team detail page, for example `#/teams/amazon`, shows a horizontally scrollable roster table on mobile.

The counts come from the build: `npm run build` prints the page total (292),
and `public/data.en.json` carries the rest in its `counts` field. Check there
rather than here if the two ever disagree.

## Current UX And Content Questions

These are not blockers for deployment, but they should be decided before presenting the site as final.

- Should the builder default budget always be `600k`, or should it be configurable per league/event?
- Should exported rosters stay as plain `.txt`, or should we add a spreadsheet/BB roster format later?
- Should base skill/trait pages only link to Blood Bowl Base, or should league-specific changed skills be visually separated more strongly?
- Should the Gata site get its own logo/art, or keep the current reused visual style until later?

## Legal Note

The site is an unofficial fan reference and should not present itself as affiliated with Games Workshop. Base Blood Bowl wording should be linked or summarized instead of copied wholesale.

## VPS Deployment (bloodbowlyerevan.shitpostsoftware.com)

This is the live deployment path for the full app (Node server + Postgres,
with accounts and saved teams), on the existing VPS at `51.81.86.51`,
following the same GitHub Actions + pm2 pattern used for
`table-booker-project`.

The server's port 80/443 are already owned by a shared Caddy container
(`paint-day-caddy`, from the `painting-evenings` project's docker-compose
stack) that also serves `paint.shitpostsoftware.com` — there is no system
nginx on this host. `bloodbowl-league` runs directly on the host via pm2
(not in Docker), so the shared Caddy container reaches it through its
docker-compose project's bridge gateway IP rather than through
`localhost`.

The site was originally deployed at `bb.shitpostsoftware.com` and was
moved to `bloodbowlyerevan.shitpostsoftware.com` on 2026-07-13. Both
names are subdomains of the same wildcard-covered `shitpostsoftware.com`,
so no DNS change was needed — only the Caddyfile site block on the
server. The old `bb.shitpostsoftware.com` block was removed rather than
kept as a redirect.

### One-time server setup

Run these once on `51.81.86.51`:

```bash
mkdir -p /opt/bloodbowl-league
git clone https://github.com/Journeymagne/bloodbowl_yerevan.git /opt/bloodbowl-league
cd /opt/bloodbowl-league
install -d -m 700 /etc/bloodbowl-league
install -m 600 .env.example /etc/bloodbowl-league/.env
# edit /etc/bloodbowl-league/.env: set a real POSTGRES_PASSWORD, then put the
# same password inside DATABASE_URL (the app reads DATABASE_URL, not
# POSTGRES_PASSWORD, directly); also set ADMIN_PASSWORD, ADMIN_TELEGRAM;
# leave APP_PORT=3002
docker compose --env-file /etc/bloodbowl-league/.env up -d
npm install
npm run build
npm run db:migrate
pm2 start server/server.mjs --name bloodbowl-league
pm2 save
```

The env file lives outside `/opt/bloodbowl-league` on purpose: that directory
is served over HTTP, and it once handed out `.env` to anyone who asked. The
server looks for the file in this order — `BLOODBOWL_ENV_FILE`, then
`/etc/bloodbowl-league/.env`, then `.env` in the repository root (which is
what local development uses); see `server/config/env-file.mjs`. `docker
compose` needs the path passed explicitly with `--env-file`; without it the
variables are missing and compose refuses to start rather than falling back
to a placeholder password.

If port 3002 isn't reachable from Docker containers yet (first-time setup
on a fresh host), allow it from the relevant docker-compose project's
subnet only — never expose it to the public internet:

```bash
docker network inspect paint-day-tracker-prod_default --format '{{json .IPAM.Config}}'
# note the Subnet, e.g. 172.18.0.0/16, then:
ufw allow from 172.18.0.0/16 to any port 3002 proto tcp
```

Then add the site block from
`deploy/caddy/bloodbowlyerevan.shitpostsoftware.com.conf` to the shared
Caddyfile and reload (no downtime for the other site on the same Caddy
container):

```bash
cat deploy/caddy/bloodbowlyerevan.shitpostsoftware.com.conf >> /home/deploy/painting-evenings/Caddyfile
docker exec paint-day-caddy caddy reload --config /etc/caddy/Caddyfile
```

The existing single-site Caddyfile (`{$SITE_ADDRESS} { ... }`) must already
be in braced-block form before appending a second site — if it's still the
unbraced single-site shorthand, wrap it in `{ }` first. Caddy provisions
the Let's Encrypt certificate for the new domain automatically on first
request; no certbot step is needed.

### GitHub secrets

Already set (as of this deploy) in the `Journeymagne/bloodbowl_yerevan`
repo settings:

- `SERVER_HOST` = `51.81.86.51`
- `SSH_PRIVATE_KEY` = a dedicated ed25519 keypair generated for this
  deploy (not shared with `table-booker-project`); its public half is in
  root's `~/.ssh/authorized_keys` on the server

If this key is ever rotated, generate a new keypair, add the public half
to the server's `authorized_keys`, and update the `SSH_PRIVATE_KEY`
secret with `gh secret set SSH_PRIVATE_KEY -R Journeymagne/bloodbowl_yerevan < path/to/key`.

### Ongoing deploys

Every push to `main` runs `.github/workflows/deploy.yml`, which pulls,
rebuilds, applies any outstanding migrations, and restarts the
`bloodbowl-league` pm2 process automatically.

The deploy runs `npm run deploy:migrate` rather than `npm run db:migrate`.
When migrations are outstanding it first takes a labelled dump,
`/var/backups/bloodbowl-league/gata_league-premigrate-YYYYMMDD-HHMMSS.dump`,
and applies nothing if that dump fails. The dump is of `POSTGRES_DB` while the
migrations go to the database in `DATABASE_URL`, so if those name different
databases the step refuses before doing either. If the schema step fails, the
workflow puts the previous code back on disk before exiting, so pm2 (still
running the previous code) cannot be restarted into the new code against the
old schema.
Labelled dumps are outside the nightly rotation: delete them by hand once the
release they guarded has settled (`ls /var/backups/bloodbowl-league/*premigrate*`).

The deploy then asks the site whether it is actually up — `/api/health` on the
server's own port, for up to thirty seconds. If it never answers, the deploy
puts the previous commit back, rebuilds, restarts, and fails the job, so a
deploy that leaves the site down no longer looks the same as one that worked.

The rollback is **code only**. Migrations are forward-only and additive, so
the older code runs against the newer schema; a migration that genuinely
breaks the older code has to be undone by hand, and the job log names the
commit to undo it back to. The `dist/` the site is served from is rebuilt on
the way back, so a rolled-back deploy serves the rolled-back build.

### Smoke test

After the first deploy and after each subsequent one:

```bash
curl -f https://bloodbowlyerevan.shitpostsoftware.com/api/health
```

Expected: `{"ok":true,"maintenance":null}`

The endpoint answers 200 even while maintenance mode is on, so `maintenance` must be `null` for the public to get the site (`npm run maintenance:status` says the same).

Also open `https://bloodbowlyerevan.shitpostsoftware.com/` in a browser, confirm the
site renders with a valid TLS certificate, then register a test account
and save a team to confirm the Postgres-backed API path works
end-to-end.

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

Run these as root. The deploy workflow logs in as root, but if you log in as
`ubuntu`, take a root shell first with `sudo -i` rather than prefixing the
commands — `sudo` before a `&&` chain applies only to the first command in the
chain, and the rest fail on permissions one at a time.

```bash
install -d -m 700 -o root -g root /var/backups/bloodbowl-league
ln -sf /opt/bloodbowl-league/deploy/systemd/bloodbowl-backup.service /etc/systemd/system/bloodbowl-backup.service
ln -sf /opt/bloodbowl-league/deploy/systemd/bloodbowl-backup.timer /etc/systemd/system/bloodbowl-backup.timer
systemctl daemon-reload
systemd-analyze verify bloodbowl-backup.timer
systemctl enable --now bloodbowl-backup.timer
```

Right after this, `npm run backup:status` correctly reports NOT OK — there are no
dumps yet, and an empty backup directory is treated as maximally stale rather than
as a pass. That is expected, not a sign the install failed; it clears up on its own
once the timer's first run lands (04:00 UTC), or immediately if you trigger one by
hand (see "To take a backup right now" below).

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

Installed on 2026-08-22. The database was 26 MB and its dump 3.0 MiB, so the
seven retained dumps take roughly 21 MiB of the 32 GB free on `/var` — what
limits the retention count here is how far back you might need to reach, not
disk. `node` is at `/usr/bin/node`, already inside systemd's own PATH, so the
drop-in above was not needed on this host. The first dump was taken by hand and
verified; the timer scheduled its next run for 04:02:56 UTC, the few minutes
past 04:00 being `RandomizedDelaySec`.

### Checking on the backups

Run this as root — the backup directory is `0700`, so anything else dies with a
bare `backup status failed: EACCES`, which by itself does not tell you the
directory just isn't readable by whatever user you ran it as.

```bash
cd /opt/bloodbowl-league && npm run backup:status
```

It prints how many dumps there are, how old the newest one is, how much disk
they use, and what systemd reports for the service and timer — then exits
non-zero if any of the following is true:

- the newest dump is more than 48 hours old (or there are no dumps at all)
- the newest dump is dated more than a few minutes in the future — this means the
  server's clock is wrong, not that a backup came early; it is reported separately
  from staleness so it reads as what it is
- there are more dumps on disk than the retention limit
- the last run of `bloodbowl-backup.service` failed
- the service or timer unit is not loaded by systemd — not installed, or
  masked (`systemctl mask`, sometimes run where `disable` was meant; the way
  back is `systemctl unmask`, since `enable` fails on a masked unit)
- the timer is not active
- the timer is active but has no future run scheduled
- any file in the backup directory could not be read. This includes the
  harmless race of a dump being rotated away between listing the directory
  and reading it, so a lone unreadable entry may be nothing — but silently
  ignoring an unknown number of unreadable files would let a permissions or
  filesystem problem hide most of the directory while the check still said
  OK, and that trade is not worth making

Two things it reports without failing the check: if `systemctl` itself is not
available, or if a value it reads back from systemd is in a shape the command
does not recognise, it prints that state as "unknown" rather than guessing —
unknown is not silently treated as healthy, but it is not treated as broken
either. That is the one command to run when you want to know whether backups
are healthy.

To take a backup right now:

```bash
systemctl start bloodbowl-backup.service
journalctl -u bloodbowl-backup.service --since "10 minutes ago" --no-pager
```

Settings that can be overridden through the environment: `BACKUP_DIR` (where dumps
are written and read from), `BACKUP_KEEP` (how many to retain), and
`POSTGRES_CONTAINER` (the container `pg_dump` runs in). `POSTGRES_DB`,
`POSTGRES_USER`, and `POSTGRES_PASSWORD` are also read from the environment first —
they override what would otherwise come from the env file, which is useful for a
one-off backup against a database other than the one the env file describes. So is
`BLOODBOWL_ENV_FILE`, which points the backup — the same as the server itself — at a
different env file than the usual `/etc/bloodbowl-league/.env` /
repo-root-`.env` fallback.

### What is verified, and what is not

Verified on the server on 2026-08-22: the units install, the timer schedules,
a dump taken by hand lands with the right ownership and permissions, and
`backup:status` reports OK.

Verified on a development machine on 2026-08-28: a dump taken by `npm run
backup:db` restores. The whole path below was walked — dump, `docker cp`,
`createdb`, `pg_restore` into a scratch database, `pg_restore -f /dev/null`
over the file to read every data block, and a row count per table compared
against the source. All eight tables matched (`users=6`, `saved_teams=14`,
`sessions=49`, `seasons=1`, `season_rounds=1`, `season_pairings=2`,
`season_entries=3`, `schema_migrations=3`). So the procedure is right and the
archive format is readable end to end.

Still not verified on the server: that a dump *taken there* restores. The
development database is small and was written by the same code, so it proves
the mechanics and not the data. `backup-db.mjs` checks every dump it writes
with `pg_restore --list`, which reads the archive's header and table of
contents but not its data, so a file truncated after the table of contents
would still pass — the `-f /dev/null` pass below is the one that reads
everything. Rotation's keep-seven rule is covered by unit tests but has not
yet run on the server against eight real files. Working through the section
below on a real nightly dump takes about a minute, and the good time to find
out is not the day you need it.

### Restoring from a backup

**Checking a dump without touching production.** This is the safe path, and the
one to use whenever the question is only "is this backup any good". The last
command reads every data block rather than just the header, which is what
`backup-db.mjs`'s own check does not do:

```bash
DUMP=$(ls -1t /var/backups/bloodbowl-league/*.dump | head -1)
docker cp "$DUMP" gata-league-postgres:/tmp/restore-check.dump
docker exec gata-league-postgres createdb -U gata_admin gata_league_restore_check
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league_restore_check /tmp/restore-check.dump
docker exec gata-league-postgres psql -U gata_admin -d gata_league_restore_check -c "SELECT count(*) FROM users;"
docker exec gata-league-postgres pg_restore -f /dev/null /tmp/restore-check.dump
docker exec gata-league-postgres dropdb -U gata_admin gata_league_restore_check
docker exec gata-league-postgres rm -f /tmp/restore-check.dump
```

Compare the user count against production (`-d gata_league`, same query). They
should match, except for accounts created after the dump was taken. To compare
every table at once rather than one:

```bash
docker exec gata-league-postgres psql -U gata_admin -d gata_league_restore_check -t -c "SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(table_name), false, true, '')))[1]::text::int FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

On Windows in Git Bash, prefix these with `MSYS_NO_PATHCONV=1` — otherwise the
shell rewrites `/tmp/restore-check.dump` into a Windows path before `docker`
sees it, and `pg_restore` reports a file that is not there.

**Restoring over production.** This destroys whatever is in the database now,
including everything written since the dump was taken. Take a fresh dump first
even if the current data looks broken — it is the only copy of the state you are
about to overwrite, and "broken" and "worthless" are not the same thing.

```bash
pm2 stop bloodbowl-league
cd /opt/bloodbowl-league && npm run backup:db
DUMP=/var/backups/bloodbowl-league/gata_league-YYYYMMDD-HHMMSS.dump   # pick one
docker cp "$DUMP" gata-league-postgres:/tmp/restore.dump
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league --clean --if-exists /tmp/restore.dump
docker exec gata-league-postgres rm -f /tmp/restore.dump
pm2 start bloodbowl-league
pm2 logs bloodbowl-league --lines 20 --nostream
curl -f https://bloodbowlyerevan.shitpostsoftware.com/api/health
```

`admin account is ready` in the log means the app reconnected and rewrote the
admin password hash from the env file. Then open the site, log in, and confirm
the data you expected to get back is actually there — the health endpoint only
says the process is up, not that it is serving the right rows. It also answers
200 while maintenance mode is on, so check that `maintenance` is `null`, as in
the smoke test above.

## Security Notes (added 2026-08-19)

### Static file exposure — fixed, but secrets must be rotated

Before this change the server resolved any request path against the deploy
directory and served whatever it found, so `/.env`, `/.git/config`,
`/server/init.sql` (the schema, since moved to `/server/db/migrations/`) and
`/package.json` were publicly downloadable on
`bloodbowlyerevan.shitpostsoftware.com`.

`server/http/static-path.mjs` now serves only:

- `index.html`, `local-preview.html`, `favicon.ico`, `robots.txt`
- anything under `dist/`, `public/`, `src/`, `assets/`

Everything else returns `404`. Covered by `test/static-path.test.mjs`
(`npm test`).

**Rotating the database and admin passwords**

The two behave differently, and getting it backwards leaves the site down with
the old password still valid.

`POSTGRES_PASSWORD` in the env file does **not** change the role's password.
The `postgres:16` image applies that variable only when it initialises an empty
data directory, and the `gata_postgres_data` volume already holds a database.
Change the role inside Postgres first:

```bash
docker exec -it gata-league-postgres psql -U gata_admin -d gata_league
# \password gata_admin   (prompts twice, never echoes, never reaches shell history)
# \q
```

`ADMIN_PASSWORD` is the opposite: editing the env file is enough, and it is the
only thing that works. `ensureAdmin()` rewrites the admin password hash from the
file on every process start, so a change made through the site survives only
until the next restart.

Then edit `/etc/bloodbowl-league/.env` — `POSTGRES_PASSWORD`, the password
inside `DATABASE_URL` (it must match what you just set on the role), and
`ADMIN_PASSWORD` — and apply:

```bash
cd /opt/bloodbowl-league
docker compose --env-file /etc/bloodbowl-league/.env up -d
npm run db:migrate
pm2 restart bloodbowl-league
pm2 logs bloodbowl-league --lines 20 --nostream
```

`admin account is ready` in the log means the app connected with the new
credentials and rewrote the admin hash. `password authentication failed` means
the role and `DATABASE_URL` disagree.

Rotated on 2026-08-22 after the exposure; see
`docs/security-incident-2026-08-22.md`.

### Postgres must not listen on the public interface

`docker-compose.yml` now publishes the database as
`127.0.0.1:${POSTGRES_PORT:-5433}:5432`. Apply it with `docker compose up -d`
and verify from another machine that port 5433 does not answer.

Applied 2026-08-22. Note that the deploy workflow does **not** run `docker
compose`, so a change to this file reaches the server only when someone runs
it by hand. Until it was applied, the port had been under a dictionary attack
since 2026-07-12 — 35 676 attempts, about one a minute.

### Verifying the fix

```bash
for p in /.env /.git/config /package.json /server/db/migrations/001_baseline.sql /docker-compose.yml; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://bloodbowlyerevan.shitpostsoftware.com$p"
done
# expected: 404 for every path

for p in / /src/app.js /public/data.en.json /assets/brand/gata-league-logo-96.png; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://bloodbowlyerevan.shitpostsoftware.com$p"
done
# expected: 200 for every path
```

### Checking whether the exposure was used

```bash
docker logs paint-day-caddy 2>&1 | grep -Ei '/\.env|/\.git' | tail -50
psql "$DATABASE_URL" -c "SELECT login, is_admin, created_at FROM users WHERE is_admin;"
```

Also review `~/.ssh/authorized_keys` on the host for unexpected keys.

**Know what these commands cannot tell you.** Caddy's access log is not enabled
(no `log` directive in the Caddyfile), so a successful download leaves no entry
— only errors are recorded. `log_connections` is off by default in the Postgres
image, so a successful login leaves no entry either. Both journals record
failures and stay silent about successes, which is exactly backwards for this
question. Turning either on is worth doing before the next incident, not during
one. The 2026-08-22 review and its limits are written up in
`docs/security-incident-2026-08-22.md`.

### Still to do

- Enable Caddy's access log and Postgres `log_connections`, so the next review
  has something to read.
- ~~Switch `Content-Security-Policy-Report-Only` to the enforcing header~~ —
  done. The theme bootstrap moved to `src/theme-boot.js` and the stylesheet
  preload swap became a plain link, so nothing on the page is inline any more;
  the policy allows neither inline script nor inline style. Checked against the
  built site under exactly that policy, with no violations. Note that
  `dist/local-preview.html` inlines its data in a `<script>` block and so only
  works off a local static server, not through Caddy.

## Maintenance Mode

Run as root on the server: `sudo -i` first, as in the setup steps above, then:

```bash
cd /opt/bloodbowl-league
npm run maintenance:on -- --kind planned --ends "2026-11-02T19:00+04:00"
npm run maintenance:status
npm run maintenance:off
```

The site closes the moment `on` runs: the server notices the flag within two
seconds, and nothing restarts. Running `on` again replaces the flag, `startsAt`
included. The options are all optional:

- `--kind` is `planned` (the default) or `unplanned`, which shows "outage"
  instead of "planned maintenance".
- `--starts` only changes the start time shown on the page; it does not
  schedule anything. The default is now.
- `--ends` drives the expected end, the countdown and the progress bar. It is
  ignored for `--kind unplanned`.

`--starts` and `--ends` must each carry an explicit UTC offset, such as
`+04:00` or `Z`; the command refuses, with exit status 1 and no change to the
flag, a missing or empty value, a repeated option, options given to `off` or
`status`, or an unexpected argument.

While the flag is up:

- every page answers 503 with the maintenance page, in the coach's palette and
  language, checking `/api/health` every 30 seconds (the page is
  `dist/public/maintenance/index.html` after a build: edit `public/` and
  rebuild);
- if that file cannot be read, pages answer a plain-text 503 instead;
- `/api/*` answers 503 `MAINTENANCE`, and a tab left open on the site reloads
  into the maintenance page;
- `/api/health` answers 200 with `maintenance: {kind, startsAt, endsAt}`.

**Checking the site during maintenance.** Requests from the server itself are
let through. Open a tunnel and use the site at `http://localhost:3002`:

```bash
ssh -o ExitOnForwardFailure=yes -L 3002:127.0.0.1:3002 ubuntu@51.81.86.51
```

If local port 3002 is busy (a local dev server, say), ssh then fails instead of
silently leaving you looking at your local site.

Sign in again there: it is a different origin, so the browser has no session
for it. Public requests never get through: Caddy reaches Node from the docker
network, and `X-Forwarded-For` is not consulted.

If Node itself is down, Caddy answers 502 — the maintenance page needs Node.

## Moving to 3.0

This is the runbook for day X, when the site moves from 2.1.0 to 3.0. It covers the master plan's phase X
(`docs/superpowers/plans/2026-10-14-redesign-rollout.md`) and §6 of the rollout spec
(`docs/superpowers/specs/2026-10-14-redesign-rollout-design.md`), with the commands. Claude sends it to the
chat the day before, with the dates filled in.

- **Who runs what.** The owner runs every command on the server, as root (`sudo -i` first, as in the
  setup steps above). Claude follows in the chat and checks the output of each step.
- **Times.** T is the start of the maintenance window. The window takes about forty minutes; the
  maintenance page announces an hour.
- **Migrations.** 3.0 brings nine of them, 009–017. The deploy applies them with `deploy:migrate`, which
  takes a labelled dump first (see "Ongoing deploys"). Each migration only adds: none deletes or changes
  data that was there before, and 2.1.0 runs on the migrated schema.
- **The point of no return is `maintenance:off`.** Before it, nobody has written anything in 3.0, and
  every way back is a code change. After it, problems are fixed forward.

The first command of every server session defines a shorthand for the database queries below. Every one
of those queries only reads:

```bash
DB() { docker exec -i gata-league-postgres psql -U gata_admin -d gata_league "$@"; }
```

### Preparation

#### After the owner's "go" on M5

1. The owner picks a quiet evening. A round may be open; see "When the window can start" below.
2. Claude prepares the pull request `redesign → main`. In it, `## [3.0.0] — unreleased` in
   `CHANGELOG.md` gets day X's date. Its body carries the M5 report.

```bash
git fetch origin && git switch redesign && git merge --no-ff origin/main && npm run build && npm test && npm run check && npm run i18n:check && git push
gh pr create --base main --head redesign --title "Gata League 3.0" --body-file <scratchpad>/pr-3.0.md
```

#### T−7 days

The owner posts in the league's Telegram; Claude drafts the text. It gives:

- the date, and a window of up to an hour;
- "finish your drafts in the builder" (a draft kept in the 2.x builder does not reach 3.0);
- "finish the post-match of the matches you have played and confirm the scores by <time>".

#### T−2 days

1. **The final rehearsal (M5), on a fresh dump.** Follow "Rehearsing a migration on a copy of
   production" in `README.md`: seed the transitions on 2.1.0, then finish them on 3.0.
2. **The five smoke checks**, on the 3.0 server over `gata_rehearsal` ("Commands" in `README.md`):
   - `smoke`
   - `smoke:pre-match`
   - `smoke:friendly`
   - `smoke:post-match`
   - `smoke:admin`

   `smoke:admin` signs in with the administrator's login and password. They are test values, kept in a
   `0600` file under `output/` that is only ever `source`d, never printed. The same values start that
   server and let `rehearsal:transitions -- --finish` sign in.
3. **The pull request.** `redesign → main` is green and has no conflicts.
4. **Rosters over 14 players (M2), on the same dump:**

   ```bash
   docker exec -i gata-league-postgres psql -U gata_admin -d gata_rehearsal -c "SELECT id, name FROM saved_teams WHERE jsonb_typeof(roster->'players') = 'array' AND jsonb_array_length(roster->'players') > 14;"
   ```

   Each row is a team that 3.0 refuses (422) on every roster save until it sells its extra players. The
   owner decides each one before the window.
5. **Technical results and re-rolls (M4), on the same dump.** Read two sections of the rehearsal report
   `output/rehearsal/report.md`:
   - **`## Technical results`.** The owner says which of these were "the opponent could not field a
     team". The administrator sets that reason after the move (see "Right after the point of no return").
   - **`## Rosters over 8 re-rolls`.** The owner decides each one before the window. Otherwise every
     write to it is refused (422 `REROLLS_MAX`).

#### T−1 day

The owner posts a reminder in Telegram. Claude sends this runbook to the chat with the dates filled in.

### When the window can start

What each pairing of the open round may be at the start of the window (rollout spec §6.2):

| The pairing | At the start of the window |
|---|---|
| Not played, preparation not begun | fine |
| Preparation begun, match not started | fine: the preparation carries on in 3.0 as it is |
| Score confirmed | fine |
| A challenge waiting or accepted | fine |
| Score proposed, not confirmed | the opponent confirms it before the window, or the administrator enters the score in 3.0 |
| Match started, post-match not finished | a warning if `rehearsal:transitions` was green on M5, a blocker otherwise |

### The window

#### T−15 min · preflight

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

What a row of the query means:

- **`awaiting confirmation`.** Agree with the opponent to confirm it now, or the administrator enters the
  score after the move.
- **`started, post-match open`.** A warning if `rehearsal:transitions` was green on M5, a blocker
  otherwise.

Blockers are settled before the start.

#### T+0 · maintenance on

```bash
npm run maintenance:on -- --kind planned --ends "$(date -u -d '+60 min' +%Y-%m-%dT%H:%M:%SZ)"
curl -s http://127.0.0.1:3002/api/health
```

`maintenance` in the answer is now the flag, not `null`. Check from a phone that the maintenance page
shows.

#### T+2 · day X's dump, and a copy on the Mac

```bash
npm run backup:db
DUMP=$(ls -1t /var/backups/bloodbowl-league/gata_league-2*.dump | head -1); echo "$DUMP"; sha256sum "$DUMP"
install -m 600 -o ubuntu -g ubuntu "$DUMP" /home/ubuntu/
```

On the Mac:

```bash
mkdir -p ~/gata-dumps && chmod 700 ~/gata-dumps
scp ubuntu@51.81.86.51:~/gata_league-YYYYMMDD-HHMMSS.dump ~/gata-dumps/
shasum -a 256 ~/gata-dumps/gata_league-YYYYMMDD-HHMMSS.dump   # the same sum as sha256sum printed on the server
chmod 600 ~/gata-dumps/*.dump
```

Once the sums match, delete the copy on the server: `rm /home/ubuntu/gata_league-YYYYMMDD-HHMMSS.dump`.

#### T+8 · the snapshot "before", and the open states again

```bash
DB -At -c "
SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(table_name), false, true, '')))[1]::text
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
SELECT 'teams=' || md5(string_agg(id || ':' || revision || ':' || md5(roster::text), ',' ORDER BY id)) FROM saved_teams;
SELECT 'pairings=' || md5(coalesce(string_agg(concat_ws('|', id, home_touchdowns, away_touchdowns, home_casualties, away_casualties,
  result_type, home_points, away_points, result_status, confirmed_at), ',' ORDER BY id), '')) FROM season_pairings;" > /root/cutover-before.txt
cat /root/cutover-before.txt
```

Then run the open states' query from T−15 again: nothing new may have appeared.

#### T+10 · the owner merges `redesign → main`

The owner merges it on GitHub, as a merge commit. Claude watches the Deploy job; its log should show:

```text
deploy:migrate: pending: 009_team_stage.sql, …, 017_season_admin.sql
backup ok: /var/backups/bloodbowl-league/gata_league-premigrate-….dump
deploy:migrate: applied 009_team_stage.sql, …, 017_season_admin.sql
deployed and answering on port 3002
```

If the job fails, the workflow has already put the previous code back (see "Ongoing deploys"), and
maintenance stays on. A migration that failed leaves the database at the last file that succeeded,
because each file runs in its own transaction. 2.1.0 starts on that database. Take the failure to T+30 as
a blocker.

#### T+15 · the schema and the data

```bash
cd /opt/bloodbowl-league && git log --oneline -1 && npm run db:migrate -- --check
DB -At -c "
SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(table_name), false, true, '')))[1]::text
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
SELECT 'teams=' || md5(string_agg(id || ':' || revision || ':' || md5(roster::text), ',' ORDER BY id)) FROM saved_teams;
SELECT 'pairings=' || md5(coalesce(string_agg(concat_ws('|', id, home_touchdowns, away_touchdowns, home_casualties, away_casualties,
  result_type, home_points, away_points, result_status, confirmed_at), ',' ORDER BY id), '')) FROM season_pairings;" > /root/cutover-after.txt
diff /root/cutover-before.txt /root/cutover-after.txt
pm2 logs bloodbowl-league --lines 100 --nostream
```

What to expect:

- **`db:migrate -- --check`** prints `database is up to date`.
- **`diff`.** `schema_migrations=8` becomes `schema_migrations=17`: nine migrations, 009–017. Four new
  tables appear:
  - `dice_rolls=0`
  - `match_events=0`
  - `team_ledger=0`
  - `team_fallen_players=<n>`, where n is the number of fallen players 015 carried over from 2.x
    post-matches; the M5 report gives the count per team on its dump.

  Nothing else differs. In particular, the `teams=` and `pairings=` lines are the same.
- **`pm2 logs`** show no errors.

The snapshot counts rows, not columns, so it cannot see 017's two new columns or its recreated view.
This query checks them:

```bash
DB -At -c "
SELECT table_name || '.' || column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND (table_name, column_name) IN
   (('seasons', 'playoff_places'), ('season_pairings', 'technical_reason'), ('match_pairing_context', 'technical_reason'))
 ORDER BY 1;"
```

Expected, three lines:

```text
match_pairing_context.technical_reason
season_pairings.technical_reason
seasons.playoff_places
```

The first line is the recreated view. A view left from before 017 has no `technical_reason`.

#### T+20 · the check through the tunnel

Open the tunnel from the Mac, as in "Maintenance Mode" above:

```bash
ssh -o ExitOnForwardFailure=yes -L 3002:127.0.0.1:3002 ubuntu@51.81.86.51
```

Then go through `http://localhost:3002` (rollout spec §6.5):

1. Sign in as the administrator, and as your own coach.
2. A team's overview.
3. The roster.
4. A player's profile, and the career by match.
5. The treasury: "History is kept since …".
6. The fallen are in place.
7. The table and the season's calendar.
8. The match card of the current round.
9. The reference, and the teams' rules.
10. Change the palette, and switch EN/RU.
11. The administration: the teams in the build.
12. An old link, `#/my-teams/…`, opens the new address.

This check only looks. Two rules keep it that way:

- **Save nothing except the palette and the language.** Those are a preference that 2.1.0 does not
  read. Above all, set no technical result's reason: a rollback to 2.1.0 would have to clear it first
  (017's header).
- **Run no smoke check and no `rehearsal:transitions` through the tunnel.** They accept any `localhost`
  as a site on this machine. Through the tunnel, `localhost:3002` is production, so they would write
  their coaches, teams and results into it. `npm run smoke` even goes there by default.

#### T+30 · decision

A blocker leads to "Rollback before the point of no return" below. Otherwise, carry on.

#### T+35 · the point of no return

```bash
npm run maintenance:off
```

From a phone: the page says "Done" («Готово») and opens 3.0. After the owner's "ok", Claude tags the
release:

```bash
git tag -a v3.0.0 -m "Gata League 3.0" origin/main && git push origin v3.0.0
```

The owner announces it in Telegram.

#### Right after the point of no return · past technical results, if any

The administrator sets the reason of every technical result from before the move, as the owner decided
it. The M5 report lists them under `## Technical results`. On the dump of 2026-10-18 (M3) there were
none, since all 28 pairings were played. The list on production (it only reads):

```bash
DB -c "
SELECT id, season_name, season_status, round_number, table_number, home_team_name, away_team_name,
       home_points, away_points, result_status, technical_reason
  FROM match_pairing_context
 WHERE result_type = 'technical' AND match_kind = 'league'
 ORDER BY season_created_at, round_number, table_number, id;"
```

How to read the list and set a reason:

- **An empty `technical_reason`** is a result from before 3.0. It counts as another reason, 2 points, as
  it always did.
- **Where the reason is set.** In Administration → Season (`#/administration/season`), open the pairing's
  "Result…" sheet. Pick the "Reason" and press "Save the reason"
  (`PATCH /api/season/admin/pairings/:id/technical-reason`).
- **What changes.** "The opponent could not field a team" makes the winner's points 4. Only the reason
  and the points change; the score, the SPP and the treasury stay as they were.
- **Which results.** The sheet reaches the confirmed results of the running season (`season_status`
  `active`). A result of an earlier season keeps its 2 points.

Rosters over 8 re-rolls are not handled here. The owner decided them before the window (T−2).

#### T+35 to T+3 h · watching

- Watch `pm2 logs bloodbowl-league`, `/api/health` and the coaches' messages.
- **A hotfix** goes on a branch `hotfix/…` from `main`, then a PR, which the owner merges and which
  deploys.
- Claude merges `main` into `redesign` only while `redesign` still exists; it can be deleted after the
  release.

### Rollback before the point of no return (scenario 1)

```bash
cd /opt/bloodbowl-league && git fetch origin --tags
git reset --hard v2.1.0 && npm install && npm run build
pm2 restart bloodbowl-league
sleep 5 && curl -fsS http://127.0.0.1:3002/api/health
npm run maintenance:off
```

The database is not restored: 2.1.0 runs on the migrated schema, and every rehearsal checks that it does.
Three things to know after a rollback:

- **A technical reason blocks 2.1.0.** If one was set all the same, 2.1.0 cannot write a played result
  over that pairing: 017's CHECK refuses it. 017's header says to clear the reasons first
  (`UPDATE season_pairings SET technical_reason = NULL`).
- **Do not push to `main`.** Any push deploys 3.0 again.
  - The next attempt is a fix, then a PR to `main`, deployed in the next window.
  - An urgent 2.1 fix before then goes on a branch `hotfix/2.1.x` from `v2.1.0`. On the server:
    `git fetch && git reset --hard origin/hotfix/2.1.x && npm install && npm run build && pm2 restart bloodbowl-league`.
- **Coming back to 3.0 later.** Players who died in a post-match finished under 2.1.0 in the meantime
  are not in `team_fallen_players`, and 015 does not run again (it is already in `schema_migrations`). Run
  the `INSERT … SELECT` of `server/db/migrations/015_backfill_fallen_players.sql` by hand. It adds nobody
  twice (`NOT EXISTS`).

### Full restore (scenario 3, only for a catastrophe in the first hours)

This is the owner's decision: everything written after the move is lost. `backup:db` takes a dump of
that state first, even if it looks broken. It is the only copy of what is about to be overwritten, and it
is what a later repair of single rows starts from.

```bash
cd /opt/bloodbowl-league && npm run maintenance:on -- --kind unplanned
pm2 stop bloodbowl-league
npm run backup:db
DUMP=/var/backups/bloodbowl-league/<day X's dump>.dump   # the one taken at T+2, not the one just taken
docker cp "$DUMP" gata-league-postgres:/tmp/restore.dump
docker exec gata-league-postgres dropdb -U gata_admin --force gata_league
docker exec gata-league-postgres createdb -U gata_admin gata_league
docker exec gata-league-postgres pg_restore -U gata_admin -d gata_league /tmp/restore.dump
docker exec gata-league-postgres rm -f /tmp/restore.dump
git reset --hard v2.1.0 && npm install && npm run build
npm run db:migrate -- --check     # database is up to date (2.1.0's migrations are the dump's)
pm2 start bloodbowl-league && sleep 5 && curl -fsS http://127.0.0.1:3002/api/health
npm run maintenance:off
```

The code goes back to `v2.1.0` because the restored database has no migrations 009–017, and 3.0 does
not start on it.

By default, do a repair of single rows instead:

1. Restore the same dump next to production, into `gata_league_recover`
   (`createdb … gata_league_recover`, then `pg_restore -d gata_league_recover`).
2. Carry the damaged rows over with an SQL query that Claude prepares for that particular damage.

### After

#### T+1 day

`npm run backup:status` is OK, and the night's dump was taken on the 3.0 schema.

#### T+14 days

```bash
# Mac
rm -P ~/gata-dumps/*.dump
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_rehearsal
# server
ls /var/backups/bloodbowl-league/*premigrate*   # check the list, then
rm /var/backups/bloodbowl-league/gata_league-premigrate-*.dump
```

#### Then

Write the date of the move and the real downtime into this file, in a PR to `main`.

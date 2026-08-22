# Deployment Handoff

This document is for the person who will publish the Gata Blood Bowl League reference site.

## Quick Deploy Checklist

1. Clone the repository.
2. Use the `gata-league` branch, or merge it into the branch you want to deploy.
3. Run `npm install`.
4. Run `npm run build`.
5. Confirm that `dist/` was generated.
6. Publish `dist/` on a static host, or connect the repository to Netlify.

## Netlify Settings

The repository already contains `netlify.toml`.

Expected settings:

```text
Build command: npm run build
Publish directory: dist
```

The app uses hash routes (`#/teams`, `#/builder`, etc.), but `netlify.toml` also includes a fallback redirect to `index.html` for static hosting safety.

## Manual Netlify Deploy

If you do not want to connect GitHub yet:

1. Run `npm run build` locally.
2. Open Netlify Drop.
3. Drag the generated `dist/` folder into Netlify.

This is good for a preview, but Git-based deploys are better for ongoing updates.

## Git-Based Netlify Deploy

Recommended flow:

1. Create a new GitHub repository for `Gata Blood Bowl League`.
2. Push this branch/repository to GitHub.
3. In Netlify, choose `Add new site` -> `Import an existing project`.
4. Select the GitHub repository.
5. Keep the build command and publish directory from `netlify.toml`.
6. Deploy.

After that, every push to the deployed branch will trigger a new build.

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
- Skills shows 93 cards.
- Traits shows 53 cards.
- Team Builder can add a player and update cost.
- A team detail page, for example `#/teams/amazon`, shows a horizontally scrollable roster table on mobile.

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
git clone https://github.com/Journeymagne/-bloodbowlyerevan.git /opt/bloodbowl-league
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

Already set (as of this deploy) in the `Journeymagne/-bloodbowlyerevan`
repo settings:

- `SERVER_HOST` = `51.81.86.51`
- `SSH_PRIVATE_KEY` = a dedicated ed25519 keypair generated for this
  deploy (not shared with `table-booker-project`); its public half is in
  root's `~/.ssh/authorized_keys` on the server

If this key is ever rotated, generate a new keypair, add the public half
to the server's `authorized_keys`, and update the `SSH_PRIVATE_KEY`
secret with `gh secret set SSH_PRIVATE_KEY -R Journeymagne/-bloodbowlyerevan < path/to/key`.

### Ongoing deploys

Every push to `main` runs `.github/workflows/deploy.yml`, which pulls,
rebuilds, and restarts the `bloodbowl-league` pm2 process automatically.

### Smoke test

After the first deploy and after each subsequent one:

```bash
curl -f https://bloodbowlyerevan.shitpostsoftware.com/api/health
```

Expected: `{"ok":true}`

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

Not verified on the server: that a dump actually restores. `backup-db.mjs`
checks every dump with `pg_restore --list`, which reads the archive's header and
table of contents but not its data, so a file truncated after the table of
contents would still pass. Rotation's keep-seven rule is covered by unit tests
but has not yet run here against eight real files. Until someone works through
the section below on a real dump, restoring is expected to work rather than
known to. It takes about a minute, and the good time to find out is not the day
you need it.

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
should match, except for accounts created after the dump was taken.

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
says the process is up, not that it is serving the right rows.

## Security Notes (added 2026-08-19)

### Static file exposure — fixed, but secrets must be rotated

Before this change the server resolved any request path against the deploy
directory and served whatever it found, so `/.env`, `/.git/config`,
`/server/init.sql` and `/package.json` were publicly downloadable on
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
for p in /.env /.git/config /package.json /server/init.sql /docker-compose.yml; do
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
- Switch `Content-Security-Policy-Report-Only` to the enforcing header after the
  inline theme script in `index.html` is moved to its own file.

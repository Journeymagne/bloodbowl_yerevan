# VPS Deployment Design — bb.shitpostsoftware.com

## Goal

Deploy the Gata Blood Bowl League site (full stack: Node server + Postgres,
with accounts and saved teams) to the existing VPS at `51.81.86.51`, served
at `bb.shitpostsoftware.com`, following the same pattern already used for
the `table-booker-project` deploys to this server.

## Architecture

```
Browser
  -> nginx on 51.81.86.51 (TLS via certbot, server_name bb.shitpostsoftware.com)
  -> reverse proxy to 127.0.0.1:3002
  -> node server/server.mjs (pm2-managed process "bloodbowl-league")
       - serves static files (index.html, src/, public/data.json) from repo root
       - serves /api/* (auth, saved teams)
  -> Postgres in Docker (docker-compose.yml, host port 5433 -> container 5432)
```

Unlike `table-booker-project` (separate client/admin static bundles deployed
via SCP, plus a separate API server), this repo already runs one unified
Node process that serves both the static site and the API from the repo
root (`server/server.mjs`, see `resolveStaticPath`). So the deploy only
needs the SSH-based backend pattern (git pull + build + pm2 restart) —
no separate SCP-to-`/var/www` step is needed.

DNS: `*.shitpostsoftware.com` already resolves to `51.81.86.51` (wildcard
record confirmed in use for other subdomains), so no new DNS record is
needed for `bb.shitpostsoftware.com`.

## Components

### 1. GitHub Actions workflow (repeatable, in-repo)

New file: `.github/workflows/deploy.yml` in `Journeymagne/-bloodbowlyerevan`,
triggered on push to `main`, mirroring `table-booker-server`'s
`appleboy/ssh-action` pattern:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: root
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/bloodbowl-league
            git pull origin main
            npm install
            npm run build
            pm2 restart bloodbowl-league
```

Steps are chained with `&&`-equivalent sequential failure (a failing
`npm install`/`npm run build` step stops the script before `pm2 restart`
runs), so a broken build does not take down the currently running
process — the old version keeps serving until a fix is pushed.

Required repo secrets (to be added by the user, not by this workflow):
- `SERVER_HOST` = `51.81.86.51`
- `SSH_PRIVATE_KEY` = private key for a user with access to
  `/opt/bloodbowl-league` and `pm2` on the server (either the existing
  table-booker deploy key, or a newly generated one — user's choice)

### 2. nginx config (template committed for reference; applied manually)

A reference config file will be added at
`deploy/nginx/bb.shitpostsoftware.com.conf`:

```nginx
server {
    listen 80;
    server_name bb.shitpostsoftware.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

This file is not executed automatically — it's a copy-paste reference for
the one-time manual nginx setup, since deployment automation has no
access to modify nginx/certbot state on the host.

### 3. `DEPLOYMENT.md` update

Add a new "VPS Deployment (bb.shitpostsoftware.com)" section documenting
the one-time manual setup and the ongoing CI-based flow.

## One-time manual server setup (performed by the user, not this session)

This session has no SSH access to `51.81.86.51`, so these steps are
documented for the user to run themselves:

1. `mkdir -p /opt/bloodbowl-league && git clone <repo-url> /opt/bloodbowl-league`
2. Create a real `.env` in `/opt/bloodbowl-league` (gitignored, not
   committed) with production values for `POSTGRES_PASSWORD`,
   `ADMIN_PASSWORD`, `ADMIN_TELEGRAM`, `APP_PORT=3002`, etc., following
   `.env.example`.
3. `docker compose up -d` — starts the Postgres container
   (`gata-league-postgres`, volume `gata_postgres_data`).
4. `npm install && npm run build`
5. `pm2 start server/server.mjs --name bloodbowl-league && pm2 save`
6. Add the nginx server block (from `deploy/nginx/bb.shitpostsoftware.com.conf`)
   to `/etc/nginx/sites-available/`, symlink into `sites-enabled`,
   `nginx -t && systemctl reload nginx`.
7. `certbot --nginx -d bb.shitpostsoftware.com` for TLS.
8. Add `SERVER_HOST` and `SSH_PRIVATE_KEY` secrets to the
   `Journeymagne/-bloodbowlyerevan` GitHub repo settings.

Once these are done, every push to `main` auto-deploys via the GitHub
Actions workflow.

## Error handling

- Build/install failures in the workflow stop before `pm2 restart`,
  leaving the previous working deployment running.
- `server.mjs` already retries the Postgres connection on startup
  (`DATABASE_CHECK_RETRIES` / `DATABASE_CHECK_DELAY_MS`) and applies
  `server/init.sql` idempotently on every boot, so `pm2 restart` after a
  deploy is safe even if the schema hasn't changed.

## Testing / smoke test

After the first deploy and after each subsequent one:
- `curl -f https://bb.shitpostsoftware.com/api/health` should return
  `{"ok":true}`.
- Load `https://bb.shitpostsoftware.com/` in a browser, confirm the site
  renders and HTTPS certificate is valid.
- Register a test account and save a team to confirm the Postgres-backed
  API path works end-to-end.

## Out of scope

- No changes to `table-booker-project` or its deploy workflows — used
  only as a reference pattern.
- Automated DNS management — not needed, wildcard record already covers
  this subdomain.

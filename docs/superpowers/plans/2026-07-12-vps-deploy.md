# VPS Deploy (bb.shitpostsoftware.com) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Gata Blood Bowl League site on the existing VPS (51.81.86.51) at `bb.shitpostsoftware.com`, with GitHub Actions auto-deploying `server/server.mjs` (static + API) behind nginx/pm2, backed by the repo's existing Postgres docker-compose setup.

**Architecture:** Browser → nginx (TLS via certbot) → reverse proxy to `127.0.0.1:3002` → single pm2-managed Node process (`bloodbowl-league`) serving static files and `/api/*` → Postgres in Docker. GitHub Actions runs `git pull && npm install && npm run build && pm2 restart` over SSH on every push to `main`, mirroring the pattern already used by `table-booker-server`.

**Tech Stack:** Node.js (no framework, `server/server.mjs`), Postgres via `docker-compose.yml`, pm2, nginx, certbot, GitHub Actions (`appleboy/ssh-action`).

## Global Constraints

- Repo is public (`Journeymagne/-bloodbowlyerevan`), so the server pulls over plain HTTPS — no deploy key needed for git itself.
- App port is `3002` (from `.env.example` `APP_PORT`), proxied internally only — never exposed directly to the internet.
- Server directory: `/opt/bloodbowl-league`. pm2 process name: `bloodbowl-league`.
- DNS: `*.shitpostsoftware.com` wildcard already points at `51.81.86.51` — no DNS changes in scope.
- This session has no SSH access to `51.81.86.51` — every server-side step is executed by the user, with exact commands provided here to paste.
- Do not touch `netlify.toml` or the existing Netlify instructions in `DEPLOYMENT.md` — that path stays as an alternative.

---

### Task 1: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: repo secrets `SERVER_HOST`, `SSH_PRIVATE_KEY` (added by the user in Task 5 — the workflow will fail on first push until those exist, which is expected until Task 5 is done).
- Produces: nothing consumed by other tasks in this repo; the deployed server exposes `http://127.0.0.1:3002` on the VPS, used by the nginx config in Task 2.

- [ ] **Step 1: Write the workflow file**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
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

- [ ] **Step 2: Validate YAML syntax offline**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/deploy.yml'); puts 'valid'"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions deploy workflow for bb.shitpostsoftware.com"
```

---

### Task 2: nginx reference config

**Files:**
- Create: `deploy/nginx/bb.shitpostsoftware.com.conf`

**Interfaces:**
- Consumes: the app port `3002` from Task 1's deployed process.
- Produces: a file the user copies to `/etc/nginx/sites-available/` on the VPS in Task 4. Not read by any code in this repo.

- [ ] **Step 1: Write the config file**

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

- [ ] **Step 2: Validate nginx syntax offline (best effort)**

Run: `nginx -t -c "$(pwd)/deploy/nginx/bb.shitpostsoftware.com.conf" 2>&1 || echo "no local nginx binary — will validate on server in Task 4"`
Expected: either a pass, or the fallback message (this Mac likely has no local nginx — that's fine, `nginx -t` runs for real on the server in Task 4).

- [ ] **Step 3: Commit**

```bash
git add deploy/nginx/bb.shitpostsoftware.com.conf
git commit -m "Add nginx reference config for bb.shitpostsoftware.com"
```

---

### Task 3: Document the VPS deploy path in DEPLOYMENT.md

**Files:**
- Modify: `DEPLOYMENT.md` (append a new section after the existing "## Legal Note" section, or before it — append at end of file)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by code; this is the canonical checklist the user follows for Task 4 and Task 5.

- [ ] **Step 1: Append the VPS section**

Add this section at the end of `DEPLOYMENT.md`:

```markdown

## VPS Deployment (bb.shitpostsoftware.com)

This is the live deployment path for the full app (Node server + Postgres,
with accounts and saved teams), on the existing VPS at `51.81.86.51`,
following the same pattern used for `table-booker-project`.

### One-time server setup

Run these once on `51.81.86.51`:

```bash
mkdir -p /opt/bloodbowl-league
git clone https://github.com/Journeymagne/-bloodbowlyerevan.git /opt/bloodbowl-league
cd /opt/bloodbowl-league
cp .env.example .env
# edit .env: set real POSTGRES_PASSWORD, ADMIN_PASSWORD, ADMIN_TELEGRAM, APP_PORT=3002
docker compose up -d
npm install
npm run build
pm2 start server/server.mjs --name bloodbowl-league
pm2 save
```

Then configure nginx and TLS:

```bash
cp deploy/nginx/bb.shitpostsoftware.com.conf /etc/nginx/sites-available/bb.shitpostsoftware.com.conf
ln -s /etc/nginx/sites-available/bb.shitpostsoftware.com.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d bb.shitpostsoftware.com
```

### GitHub secrets

In the `Journeymagne/-bloodbowlyerevan` repo settings, add:

- `SERVER_HOST` = `51.81.86.51`
- `SSH_PRIVATE_KEY` = a private key authorized to SSH as `root` on the
  server (reuse the `table-booker-project` deploy key, or generate a new
  keypair and add the public half to the server's `authorized_keys`)

### Ongoing deploys

Every push to `main` runs `.github/workflows/deploy.yml`, which pulls,
rebuilds, and restarts the `bloodbowl-league` pm2 process automatically.

### Smoke test

After the first deploy and after each subsequent one:

```bash
curl -f https://bb.shitpostsoftware.com/api/health
```

Expected: `{"ok":true}`

Also open `https://bb.shitpostsoftware.com/` in a browser, confirm the
site renders with a valid TLS certificate, then register a test account
and save a team to confirm the Postgres-backed API path works
end-to-end.
```

- [ ] **Step 2: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "Document VPS deployment path for bb.shitpostsoftware.com"
```

---

### Task 4: One-time server setup (user-executed)

**Files:** none in this repo — all commands run on `51.81.86.51`.

**Interfaces:**
- Consumes: the `DEPLOYMENT.md` "VPS Deployment" section from Task 3 and `deploy/nginx/bb.shitpostsoftware.com.conf` from Task 2.
- Produces: a running `bloodbowl-league` pm2 process on port 3002, a running Postgres container, and an nginx vhost with a valid TLS cert for `bb.shitpostsoftware.com`. Task 5 and the smoke test in Task 6 depend on this being done first.

- [ ] **Step 1: Clone the repo and configure `.env`**

Run on the server:

```bash
mkdir -p /opt/bloodbowl-league
git clone https://github.com/Journeymagne/-bloodbowlyerevan.git /opt/bloodbowl-league
cd /opt/bloodbowl-league
cp .env.example .env
```

Edit `/opt/bloodbowl-league/.env` and set real values for
`POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, `ADMIN_TELEGRAM`; leave
`APP_PORT=3002`.

- [ ] **Step 2: Start Postgres and the app**

```bash
cd /opt/bloodbowl-league
docker compose up -d
npm install
npm run build
pm2 start server/server.mjs --name bloodbowl-league
pm2 save
```

Expected: `pm2 list` shows `bloodbowl-league` with status `online`, and
`curl -s http://127.0.0.1:3002/api/health` returns `{"ok":true}`.

- [ ] **Step 3: Configure nginx and TLS**

```bash
cp /opt/bloodbowl-league/deploy/nginx/bb.shitpostsoftware.com.conf /etc/nginx/sites-available/bb.shitpostsoftware.com.conf
ln -s /etc/nginx/sites-available/bb.shitpostsoftware.com.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d bb.shitpostsoftware.com
```

Expected: `nginx -t` reports `syntax is ok` / `test is successful`, and
certbot reports the certificate was obtained and installed.

- [ ] **Step 4: Confirm from outside the server**

```bash
curl -f https://bb.shitpostsoftware.com/api/health
```

Expected: `{"ok":true}`

---

### Task 5: GitHub repo secrets (user-executed)

**Files:** none — GitHub repo settings only.

**Interfaces:**
- Consumes: the SSH key decided on during design (existing table-booker key, reused, or a freshly generated one already authorized on the server per Task 4).
- Produces: `SERVER_HOST` and `SSH_PRIVATE_KEY` secrets that Task 1's workflow reads on the next push.

- [ ] **Step 1: Add the secrets**

Via GitHub UI (`Settings -> Secrets and variables -> Actions` on
`Journeymagne/-bloodbowlyerevan`) or via `gh` if you'd rather paste the
key to me to set:

```bash
gh secret set SERVER_HOST -R Journeymagne/-bloodbowlyerevan --body "51.81.86.51"
gh secret set SSH_PRIVATE_KEY -R Journeymagne/-bloodbowlyerevan < /path/to/private_key
```

- [ ] **Step 2: Verify secrets are set**

```bash
gh secret list -R Journeymagne/-bloodbowlyerevan
```

Expected: both `SERVER_HOST` and `SSH_PRIVATE_KEY` listed.

---

### Task 6: End-to-end deploy verification

**Files:** none.

**Interfaces:**
- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: Push a trivial change to `main` and watch the Action run**

```bash
gh run watch -R Journeymagne/-bloodbowlyerevan
```

(or check the "Actions" tab in GitHub after the push from Task 1–3's
commits lands on `main`)

Expected: the `Deploy` workflow run succeeds (green check).

- [ ] **Step 2: Re-run the smoke test**

```bash
curl -f https://bb.shitpostsoftware.com/api/health
```

Expected: `{"ok":true}`

- [ ] **Step 3: Manual browser check**

Open `https://bb.shitpostsoftware.com/` — confirm the site loads, the
team/skill/trait reference pages render, and registering an account +
saving a team succeeds.

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
cp .env.example .env
# edit .env: set real POSTGRES_PASSWORD, then update the password inside
# DATABASE_URL to match it (the app reads DATABASE_URL, not POSTGRES_PASSWORD,
# directly); also set ADMIN_PASSWORD, ADMIN_TELEGRAM; leave APP_PORT=3002
docker compose up -d
npm install
npm run build
pm2 start server/server.mjs --name bloodbowl-league
pm2 save
```

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

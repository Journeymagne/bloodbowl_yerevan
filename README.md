# Gata Blood Bowl League Reference

Static reference site for the Gata Blood Bowl League, an unofficial Blood Bowl Sevens fan league.

The site contains:

- team rosters and team-building data;
- star player reference cards;
- skills and traits reference entries;
- Gata league rules and patch notes;
- a lightweight team builder;
- legal/disclaimer text for an unofficial fan project.

## Project Structure

- `content/Gata` - generated Markdown content used as the source for the site.
- `scripts/import-gata-content.py` - optional importer from the original Gata `.xlsx` and `.docx` source files.
- `scripts/build-data.mjs` - converts Markdown content into `public/data.json`.
- `scripts/build-site.mjs` - copies the static app into `dist` for hosting.
- `index.html`, `src/app.js`, `src/styles.css` - static frontend.
- `public/data.json` - generated site data.
- `dist` - generated deploy output, ignored by Git and recreated during build.
- `dist/local-preview.html` - the site with all reference data inlined. It still
  has to be **served** (`npm run dev`, or any static server pointed at `dist/`)
  rather than opened straight off disk: `src/app.js` is an ES module and browsers
  refuse to load modules over `file://`.
- `netlify.toml` - Netlify build and redirect settings.

## Commands

```bash
npm run build
npm run dev
npm run start
npm run postgres:up
npm run postgres:down
npm run postgres:reset
```

Checks:

```bash
npm run check      # unreachable functions + file/function size budgets
npm test           # unit tests (node:test, no dependencies)
npm run i18n:check # EN/RU page parity
npm run smoke      # API + static exposure, needs a running server
```

Two optional checks drive a real browser. They need Playwright, which is
intentionally not a dependency of this project:

```bash
npm i -D playwright && npx playwright install chromium
```

Public screens, the builder and static exposure, against the dev server:

```bash
npm run dev            # in another terminal
node scripts/browser-check.mjs
```

The logged-in saved roster editor, against a small in-memory fake API so no
database is needed:

```bash
node scripts/mock-api.mjs &
node scripts/browser-check-roster.mjs
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```powershell
npm.cmd run build
npm.cmd run dev
```

After `npm run dev`, the site runs at:

```text
http://localhost:5173
```

For persistent users, saved teams and profile editing, run PostgreSQL with Docker Desktop and then start the site locally:

```bash
cp .env.example .env
npm run postgres:up
npm start
```

By default the site and API run at:

```text
http://localhost:3002
```

Useful environment variables in `.env`:

- `APP_PORT` - public site/API port, default `3002`.
- `DATABASE_URL` - Postgres connection string used by the app.
- `DATABASE_CHECK_RETRIES`, `DATABASE_CHECK_DELAY_MS` - startup database connection retry settings.
- `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` - database settings.
- `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `ADMIN_TELEGRAM` - seeded site admin account.

`npm run postgres:up` starts only Postgres from `docker-compose.yml`. `npm start` builds the reference data and starts the site/API locally. The server reads `.env` and connects to Postgres through `localhost:${POSTGRES_PORT}`.

On Windows you can also run:

```powershell
.\scripts\start-postgres.ps1
.\scripts\start-site.ps1
```

Stop the database:

```bash
npm run postgres:down
```

Delete the local database data and recreate it from scratch on the next start:

```bash
npm run postgres:reset
```

## Optional Content Re-import

The repository already contains generated Markdown in `content/Gata`, so a deployer does not need the original source files just to publish the site.

If the original source files change, put them into `source/` with these names:

```text
source/Gata League 2_ Info.xlsx
source/Gata League 2.0 ENG.docx
source/Gata League 2 Changelog ENG.docx
```

Then run:

```bash
npm run import:gata
npm run build
```

You can also point the importer at files elsewhere:

```powershell
$env:GATA_XLSX="C:\path\to\Gata League 2_ Info.xlsx"
$env:GATA_RULES_DOCX="C:\path\to\Gata League 2.0 ENG.docx"
$env:GATA_CHANGELOG_DOCX="C:\path\to\Gata League 2 Changelog ENG.docx"
npm.cmd run import:gata
npm.cmd run build
```

## Team XLSX Import

Roster sheets from the league workbook can be converted into a cloud-importable Postgres SQL file and an Administration UI import file:

```powershell
npm.cmd run team-import:sql -- --xlsx "X:\Downloads\Gata League 2_  Info.xlsx" --sheet "Drunken Rune Guard (Andrei)" --sql-out ".codex_tmp\team-imports\drunken-rune-guard.sql"
```

The command also writes a `.credentials.json` file with the generated login/password and a `.team-import.json` file next to the SQL. Log in as an admin, open Administration, click Import Users, and upload the `.team-import.json` file to create or update the user and saved team through the site.

To apply that SQL to a remote database, point `DATABASE_URL` at the cloud Postgres instance and run:

```powershell
$env:DATABASE_URL="postgres://user:password@host:5432/database"
npm.cmd run team-import:apply -- ".codex_tmp\team-imports\drunken-rune-guard.sql"
```

## Deployment

See `DEPLOYMENT.md` for Netlify and handoff instructions.

## Notes

This is an unofficial fan reference. It is not affiliated with, endorsed by, or sponsored by Games Workshop. Base Blood Bowl wording is referenced externally instead of being reproduced wholesale.

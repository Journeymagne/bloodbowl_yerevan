# Gata Blood Bowl League Reference

League management and reference site for the Gata Blood Bowl League, an unofficial Blood Bowl Sevens fan league.

Current release: **2.0.0**. See [CHANGELOG.md](CHANGELOG.md) for release details and upgrade instructions.

The site contains:

- team rosters and team-building data;
- star player reference cards;
- skills and traits reference entries;
- Gata league rules and patch notes;
- a team builder with saved rosters, player progression and transfers;
- season registration, pairings, results and administration;
- friendly challenges with the same match workflow as league games;
- pre-match and post-match checklists with roster and treasury settlement;
- legal/disclaimer text for an unofficial fan project.

## Project Structure

- `content/Gata` - generated Markdown content used as the source for the site.
- `scripts/import-gata-content.py` - optional importer from the original Gata `.xlsx` and `.docx` source files.
- `scripts/build-data.mjs` - converts Markdown content into `public/data.json`.
- `scripts/build-site.mjs` - copies the static app into `dist` for hosting.
- `index.html`, `src/app.js`, `src/styles.css` - static frontend.
- `src/components/matchday.mjs` and `games/checklist-layout.mjs` - shared heroes, scoreboards and match checklist layouts; each checklist screen retains its own rules and actions.
- `src/components/saved-teams.mjs` - saved-team cards used by My Teams and public/admin profiles.
- `src/styles/tokens.css`, `controls.css`, `overlays.css` - common theme, form and dialog styles; screen styles specialise layout.
- `public/data.json` - generated site data.
- `dist` - generated deploy output, ignored by Git and recreated during build.
- `dist/local-preview.html` - the site with all reference data inlined. It still
  has to be **served** (`npm run dev`, or any static server pointed at `dist/`)
  rather than opened straight off disk: `src/app.js` is an ES module and browsers
  refuse to load modules over `file://`.

## Running Locally

Install these first:

- **Node.js** (includes `npm`) - <https://nodejs.org/en/download>
- **Docker Desktop**, for the local PostgreSQL database that keeps users, saved teams and profile edits - <https://docs.docker.com/desktop/setup/install/windows-install/> (Windows; the same site has the macOS and Linux installers)

Open a new terminal after installing so `node` and `npm` are on the `PATH`, and make sure Docker Desktop is running.

First-time setup, from the repository root:

```bash
npm ci                 # install dependencies
cp .env.example .env   # Windows cmd: copy .env.example .env
npm run postgres:up    # start PostgreSQL in Docker
npm run db:migrate     # create the database tables
npm start              # build the site and serve it
```

The `.env` file is not in the repository (it holds passwords and is git-ignored), so it has to be created from `.env.example` before anything else works - both Docker and the server read it. The example values are fine for local use. If you change `POSTGRES_PASSWORD`, put the same password inside `DATABASE_URL`: the app connects with `DATABASE_URL`, not with `POSTGRES_PASSWORD`.

The site and API then run at <http://localhost:3002>. Log in with `ADMIN_LOGIN` / `ADMIN_PASSWORD` from `.env` to reach the admin screens.

On later runs only `npm run postgres:up` and `npm start` are needed; run `npm run db:migrate` again when a new file appears in `server/db/migrations/`.

`npm start` builds once and serves the result from `dist/`. After editing anything in `src/` or `content/`, run `npm run build` in a second terminal and hard-refresh the page (Ctrl+F5) to see the change.

After changing `server/`, restart the running site server as well: its API modules are loaded at startup. Building the frontend alone can show new screens against an older API and produce “API route not found.” Apply any new database migrations before restarting. Use the port printed by the restarted server.

If a step fails:

| Message | Cause | Fix |
|---|---|---|
| `required variable POSTGRES_DB is missing a value` | no `.env` file | `cp .env.example .env` |
| `Cannot find package 'pg'` | dependencies not installed | `npm ci` |
| `database is behind: ... not applied` | fresh database, no tables yet | `npm run db:migrate` |

### `npm run dev` vs `npm start`

`npm run dev` builds the reference data and serves the source files as they are at <http://localhost:5173>. It needs no Docker, no database and no `.env`, but it has no API either: login, saved teams, the season and administration screens cannot load anything.

| | `npm run dev` | `npm start` |
|---|---|---|
| Needs Docker, Postgres, `.env` | no | yes |
| API (login, saved teams, season, admin) | no | yes |
| Serves | source files in `src/` | the built copy in `dist/` |
| After editing `src/` | refresh the page | `npm run build`, then refresh |
| After editing `content/` | restart `npm run dev` | `npm run build`, then refresh |
| Port | 5173 | 3002 |

Use `npm run dev` for the reference pages and general styling, `npm start` for anything behind a login.

`npm run dev` serves the stylesheets unminified, so a style can look right there and still break in the built site. Check CSS changes once against the build before calling them done.

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

Useful environment variables in `.env`:

- `APP_PORT` - public site/API port, default `3002`.
- `DATABASE_URL` - Postgres connection string used by the app.
- `DATABASE_CHECK_RETRIES`, `DATABASE_CHECK_DELAY_MS` - startup database connection retry settings.
- `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` - database settings.
- `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `ADMIN_TELEGRAM` - seeded site admin account.

`npm run postgres:up` starts only Postgres from `docker-compose.yml`. `npm start` builds the reference data and starts the site/API locally. The server reads `.env` and connects to Postgres through `localhost:${POSTGRES_PORT}`.

The `.env` in the repository root is the local-development location. The server looks for the file in this order: `BLOODBOWL_ENV_FILE`, then `/etc/bloodbowl-league/.env`, then the repository root (see `server/config/env-file.mjs`). Production keeps it in `/etc` because `/opt/bloodbowl-league` is served over HTTP — see the security notes in `DEPLOYMENT.md`.

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

## Local Pre-match Preview

The game page opens a Gata Sevens checklist: fans, seasonal weather, available roster and optional journeymen, inducements, and both coaches' confirmation. A team may start with fewer than seven available players. All Lineman positions can be used for journeymen, subject to their position limits, regardless of the roster's Qty label. Kick/receive selection happens at the table and is omitted from the app's checklist. Start saves match-only players/effects and spends treasury exactly once. Mercenaries remain unavailable until Gata hiring rules are specified. Existing preparations retain their fans, weather and purchases when the policy updates; both coaches review them again. Started match snapshots remain sealed.

The whole site uses the builder's Matchday styling: framed page headers, square cards and controls, monospace stat strips, and the same six colour palettes. This includes navigation, reference pages, saved team cards, season tables, game screens and dialogs. Saved teams use roster cards on desktop as well as mobile.

For a local preview with an existing Postgres instance:

```powershell
npm.cmd run build
npm.cmd run db:migrate
$env:APP_PORT='3003'
npm.cmd run preview:seed
npm.cmd run server
```

The seed prints the match URL and creates only a separate preview season and demo accounts. Sign in as `preview-home` or `preview-away`, password `preview2026`. Use separate browser profiles to act as both coaches. Rerunning the seed keeps the match's current preparation.

With the local server running, `npm.cmd run smoke:pre-match` checks authorization, conflicts, phase order, roster changes, effects, snapshots and concurrent/idempotent spending on disposable fixtures. It removes only its own fixtures afterward. Set `SMOKE_BASE_URL` if using a port other than 3003. Both helpers refuse a non-local database.

## Friendly Challenges

In My Games, choose your saved team and another coach to send a friendly challenge. The recipient chooses their own team when accepting. Pending challenges can be declined by the recipient or cancelled by the sender. Accepted challenges open a match for both coaches and remain accessible in My Games and recent challenge responses.

Friendly matches use the same Gata Sevens preparation checklist, match snapshots, treasury spending and two-coach result confirmation as league matches. They can be played independently of season rounds. Results award zero LP, including bonuses, and never enter the season standings or schedule. Teams participating in accepted matches cannot be deleted, preserving their match history.

Apply migration `006_friendly_challenges.sql` before starting the updated server. With the local preview accounts and server running, `npm.cmd run smoke:friendly` checks the complete flow, access rules, concurrent acceptance/start, and zero LP on disposable teams and matches; it removes its own fixtures afterward. `SMOKE_BASE_URL` defaults to `http://localhost:3003`.

## Post-match Checklist

Started league and friendly games open the same post-match checklist: agree on the result, record income and Dedicated Fans, enter match statistics and final injuries, choose MVP manually, optionally advance players, manage the roster, resolve treasury risks and prepare the next roster. A final review shows both coaches' MVPs, SPP, injuries, purchases, treasury and fans before they confirm. All MVP/advancement/fan/treasury dice are rolled at the table and entered by the coach. MVP awards give 5 SPP. Advancement may be skipped even when enough SPP are saved for a characteristic increase.

Changes stay in a saved draft until both coaches confirm and either completes the match. Completion applies both rosters and the agreed result in one transaction, with version checks and receipts preventing duplicate SPP or cash. Friendlies award zero LP while retaining SPP, winnings, injuries and recovery. Old MNG flags clear; new lasting injuries and temporary retirement persist. Gata rules include rookie protection, a 15k bonus for fully painted teams, Coach's Safe, journeyman retention and team-specific advancement/roster rules. Independent opponent edits do not discard your form; edits to your own draft in another window require a refresh.

Permanently hiring a Mortuary Assistant or Plague Doctor costs 50k. Each adds 50k to TV/CTV. Their separate one-match inducements cost 100k.

Apply `007_post_match.sql` with `npm.cmd run db:migrate`, then rebuild and restart the API. Routes: `#/games/:id/post-match/:step?`, `GET/PATCH /api/games/:id/post-match`, `POST /api/games/:id/finish`. Existing started matches with saved match rosters can use the checklist. Matches without snapshots continue using the previous result entry.

`npm.cmd run smoke:post-match` checks league/friendly completion, permissions, revisions, transaction rollback, manual MVP, optional advancement, recovery, legacy game counts and concurrent/idempotent completion on disposable local fixtures. It defaults to `http://localhost:3002` and refuses a non-local database. Add `-- --keep-preview` to leave a separate friendly game at the player step and print its URL; use the preview accounts above. Detailed rules and implementation decisions are in [the post-match implementation notes](docs/superpowers/plans/2026-10-06-post-match-checklist.md).

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

See `DEPLOYMENT.md` for deployment and handoff instructions.

## Notes

This is an unofficial fan reference. It is not affiliated with, endorsed by, or sponsored by Games Workshop. Base Blood Bowl wording is referenced externally instead of being reproduced wholesale.

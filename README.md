# Gata League

The site of the Gata Blood Bowl League, an unofficial Blood Bowl Sevens fan league. Each coach runs their teams through the season on it, from the draft of a new team to the post-match of the last game, and anyone can read the league's rules, its table and its reference.

Current release: **3.0.0**. See [CHANGELOG.md](CHANGELOG.md) for what changed, and "Moving to 3.0" in [DEPLOYMENT.md](DEPLOYMENT.md) for moving a 2.x site to it.

The site contains:

- a coach's teams: the draft of a new team, the overview, the roster with its match records, the players who miss the next match and the fallen, hiring and selling, player profiles, advancement with dice rolled on the site or at the table, each player's career by match, and the treasury and resources with their history;
- matches: the season's match board, the preparation, the match in play, the post-match step by step, and friendly challenges;
- the league table and the season's calendar, an opponent's team and a coach's profile;
- the reference: team rules, star players, skills and traits, inducements, the league's rules and patch notes, with one search over them;
- the administration: coaches, the season's rounds, pairings and entries, and any team's roster;
- a guest's home page, settings with eight palettes in a light or dark mode, and English and Russian throughout;
- legal/disclaimer text for an unofficial fan project.

## Project Structure

- `content/Gata` - the English Markdown vault the site is built from; `content/Gata-ru` - its Russian translation, with the same file names (see `docs/i18n-glossary.md`).
- `scripts/import-gata-content.py` - optional importer from the original Gata `.xlsx` and `.docx` source files.
- `scripts/build-data.mjs` - converts the vaults into `public/data.en.json` and `public/data.ru.json`.
- `scripts/build-site.mjs` - copies the static app into `dist` for hosting, with `src/styles.css` folded into one stylesheet.
- `index.html`, `src/app.js`, `src/styles.css` - the page, the bootstrap and the list of stylesheets.
- `src/core` - the router and the route table, the API client, i18n, the DOM helpers, the theme.
- `src/shell` - the frame around every screen: the phone's header and tabs, the desktop's side navigation, the team switcher, the current match.
- `src/ui` - the design system's components (buttons, sheets, steppers, the roster table, the match board…) and `base.css`; `src/styles/tokens.css` holds the eight palettes.
- `src/screens/*` - one folder per part of the site: `auth`, `home`, `teams` (My Teams, the draft), `team` (overview, roster, player, treasury and resources), `matches` (preparation, post-match, challenges, the match page), `season`, `coaches`, `ref`, `settings`, `admin`.
- `src/data` - what the screens read and write through the API: the session, teams, the roster's save queue, the treasury, games, the administration.
- `src/domain` - the league's rules as pure functions (rosters, costs, advancement, the match and the post-match), shared by the screens and the server.
- `src/i18n/en.json`, `ru.json` - every string of the interface, in both languages.
- `server/` - the API over Postgres; `server/db/migrations/` - the schema, one numbered file per change.
- `scripts/mock-api.mjs`, `scripts/mock/` - an in-memory fake API for driving the screens without a database.
- `docs/redesign/screens/*.json` - the app states `npm run screens` photographs.
- `public/data*.json` - generated site data.
- `dist` - generated deploy output, ignored by Git and recreated during build.
- `dist/local-preview.html` - the site with all reference data inlined. It still
  has to be **served** (`npm run dev`, or any static server pointed at `dist/`)
  rather than opened straight off disk: `src/app.js` is an ES module and browsers
  refuse to load modules over `file://`.

## Running Locally

Install these first:

- **Node.js** (includes `npm`) - <https://nodejs.org/en/download>
- **Docker Desktop**, for the local PostgreSQL database that keeps users, teams, matches and the season - <https://docs.docker.com/desktop/setup/install/windows-install/> (Windows; the same site has the macOS and Linux installers)

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

The site and API then run at <http://localhost:3002>. Sign in with `ADMIN_LOGIN` / `ADMIN_PASSWORD` from `.env` to reach the administration.

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

`npm run dev` builds the reference data and serves the source files as they are at <http://localhost:5173>. It needs no Docker, no database and no `.env`, but it has no API either: signing in, teams, matches, the season and the administration cannot load anything.

| | `npm run dev` | `npm start` |
|---|---|---|
| Needs Docker, Postgres, `.env` | no | yes |
| API (sign-in, teams, matches, season, administration) | no | yes |
| Serves | source files in `src/` | the built copy in `dist/` |
| After editing `src/` | refresh the page | `npm run build`, then refresh |
| After editing `content/` | restart `npm run dev` | `npm run build`, then refresh |
| Port | 5173 | 3002 |

Use `npm run dev` for the reference pages and general styling, `npm start` for anything behind a sign-in.

`npm run dev` serves the stylesheets unminified, so a style can look right there and still break in the built site. Check CSS changes once against the build before calling them done.

The screens behind a sign-in can also be driven by hand without a database, against an in-memory fake API: `npm run build`, then `node scripts/mock-api.mjs`, and open <http://localhost:5174>. Any login signs in with the password `mock-pass`; `MOCK_PORT` picks another port, `MOCK_ADMIN=1` makes the coach an administrator, and `MOCK_EMPTY=1` gives a coach with no team and no match. It forgets everything when it stops.

## Commands

```bash
npm run build
npm run dev
npm run start
npm run postgres:up
npm run postgres:down
npm run postgres:reset
npm run db:migrate
```

Checks:

```bash
npm run check      # unreachable functions, unused imports, uses never imported, file/function size budgets
npm test           # unit tests (node:test, no dependencies)
GATA_TEST_DATABASE_URL=postgres://gata_admin:…@localhost:5437/gata_league npm test   # + database tests
npm run i18n:check # EN/RU page parity and the glossary; English that skipped t()
```

The database tests (migrations, and SQL a fake client cannot check) run only when GATA_TEST_DATABASE_URL names a local Postgres. Each one creates its own gata_test_* database from template0 and drops it afterwards; the database in the URL is never opened. Without the variable they are skipped.

Smoke checks, each against a running server on this machine (`npm run build` first: they read the built rules). Each makes its own fixtures:

```bash
npm run smoke              # the API and static exposure; APP_URL (default http://localhost:3002)
npm run smoke:pre-match    # the preparation
npm run smoke:friendly     # challenges and a friendly
npm run smoke:post-match   # the post-match
npm run smoke:admin        # the administration; APP_URL, SMOKE_ADMIN_LOGIN, SMOKE_ADMIN_PASSWORD
```

The three match smokes sign in as the preview coaches of `npm run preview:seed` ("A Match, Locally" below), and take `DATABASE_URL`, which must name a local database, and `SMOKE_BASE_URL`: `smoke:pre-match` and `smoke:friendly` default to http://localhost:3003, `smoke:post-match` to http://localhost:3002.

`smoke:admin` signs in as an administrator. Keep that login and password in a file only you can read (`chmod 600`), in `output/` where Git ignores it, that sets `ADMIN_LOGIN` and `ADMIN_PASSWORD`; only ever `source` it - never `cat` it, and never type the password on the command line:

```bash
. output/admin.env && SMOKE_ADMIN_LOGIN="$ADMIN_LOGIN" SMOKE_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  APP_URL=http://localhost:3002 npm run smoke:admin
```

It prints no password or token. A coach it enters in the season stays there after the run, with a rival: use a database you can throw away.

Screenshots, with the local Google Chrome running headless, of the app states a JSON file lists (the servers it points at must be running), and two sets of them compared pixel by pixel:

```bash
npm run screens -- docs/redesign/screens/rd-12.json --out output/screens/before
npm run screens:diff -- output/screens/before output/screens/after --out output/screens/diff.json
```

Maintenance mode, which closes the site to coaches while an operator works on it (see "Maintenance Mode" in `DEPLOYMENT.md`):

```bash
npm run maintenance:on -- --kind planned --ends "2026-11-02T19:00+04:00"
npm run maintenance:status
npm run maintenance:off
```

Backups and rehearsals: `npm run backup:db` and `npm run backup:status` (see "Database Backups" in `DEPLOYMENT.md`); `npm run rehearsal:restore`, `rehearsal:check`, `rehearsal:migrate` and `rehearsal:transitions` (below).

Two optional checks drive a real browser. They need Playwright, which is
intentionally not a dependency of this project:

```bash
npm i -D playwright && npx playwright install chromium
```

Public screens and static exposure, against the dev server:

```bash
npm run dev            # in another terminal
node scripts/browser-check.mjs
```

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd` (`npm.cmd run build`), and set a variable with `$env:APP_PORT='3003'` instead of `APP_PORT=3003 …`.

Useful environment variables in `.env`:

- `APP_PORT` - public site/API port, default `3002`.
- `DATABASE_URL` - Postgres connection string used by the app.
- `DATABASE_CHECK_RETRIES`, `DATABASE_CHECK_DELAY_MS` - startup database connection retry settings.
- `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` - database settings.
- `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `ADMIN_TELEGRAM` - seeded site admin account. Its login, password, Telegram and rights live here only: the site shows them read only.
- `REHEARSAL_PASSWORD` - the password every account of a rehearsal copy gets (below).

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

## A Match, Locally

`npm run preview:seed` creates a separate preview season with two demo coaches and a match between them, and leaves every other coach alone. It prints the match's preparation address; sign in as `preview-home` or `preview-away`, password `preview2026`, each in a browser profile of its own to play both sides. Rerunning it keeps the match where it is. It refuses a database that is not local.

```bash
npm run build
npm run db:migrate
APP_PORT=3003 npm run preview:seed
APP_PORT=3003 npm run server
```

A match goes through three stages; the preparation and the post-match are screens in a frame of their own, without the site's navigation:

Each coach fills only their own team's checklist and can complete its steps without waiting for the other coach's approvals. The weather and score are shared: saving the score once opens both post-match checklists. Start and finish still require both teams' completed checklists; the match's overall stages and transactional settlement are unchanged. Later opponent purchases or statistics can change compensation or income: affected purchase/treasury steps reopen for review instead of applying an outdated amount. Existing post-matches waiting on a score approval resume automatically when read.

Pairing a round does not freeze the rosters. Opening preparation reads the current saved teams, including player advancements, SPP, characteristics, hires, injuries and resources. Existing preparations compare the actual team data as well as the revision, so an import or repair with an unchanged revision cannot leave an old roster in use. Refreshing keeps fans and weather but reopens roster-dependent choices. The match start checks the same data under locks and seals its snapshots; subsequent team changes do not rewrite a started match.

- **Preparation** (`#/games/:id/pre-match`): fans, the weather (one roll for the match), the roster and journeymen, inducements and their effects, and the start. A team may start with fewer than seven available players. Every Lineman position can field journeymen, within its position limit, whatever the roster's Qty says. Kick and receive are decided at the table. Mercenaries are not the league's and are not offered. The start saves the match's own players and effects and spends the treasury once; a started match's snapshot is sealed.
- **The match in play:** each coach records it in the team's roster - touchdowns, casualties, completions and the rest as taps, and injuries - while the team's own roster, treasury and dead are held until the post-match is finished.
- **Post-match** (`#/games/:id/post-match`), seven steps for each side: the score (a concession, or a technical result and its reason), income, players (the match's records with their SPP, the MVP, injuries, veterans who leave after a concession), the roster (staff, hiring and selling, journeymen, Raise Dead), the treasury (the Coach's Safe, Expensive Mistakes), the next match, and the review. Advancement works inside it, with the dice rolled on the site or at the table. A side's step is written when it is pressed. The match is finished once both coaches confirm the summary: the finish applies both rosters, the treasuries and the result in one transaction, once, however often pressed. The players who died go to the team's fallen.

The match page itself (`#/games/:id`) takes a coach of either side to where the match is now, and shows anyone else the match.

**Friendly challenges** (`#/t/:id/challenges`): a coach challenges another, found by login or team name or among the recent opponents; the other accepts with a team of their own and goes straight to the preparation, or declines; the sender can cancel. A friendly uses the same preparation and post-match as a league match, can be played whatever the season's round, and awards no League Points: it never enters the league table. A team with an accepted match cannot be deleted.

With the preview accounts and the server running, `smoke:pre-match`, `smoke:friendly` and `smoke:post-match` check the same flows on fixtures of their own, which they remove afterwards (`SMOKE_BASE_URL` names the server, `DATABASE_URL` its local database). `smoke:post-match -- --keep-preview` leaves one friendly at its Players step and prints its address.

## Rehearsing a migration on a copy of production

Before a release that changes the schema, restore a production dump locally,
anonymized, and prove the migrations leave existing data alone. Rehearsals only
ever touch the local database `gata_rehearsal`.

1. Copy a dump from the server (see DEPLOYMENT.md, "Database Backups") to
   `~/gata-dumps/` on an encrypted disk. The backup directory is root-only, so
   hand the dump to `ubuntu` first, and compare checksums before deleting the
   copy on the server:

```bash
# on the server, as root (sudo -i)
install -m 600 -o ubuntu -g ubuntu /var/backups/bloodbowl-league/gata_league-YYYYMMDD-HHMMSS.dump /home/ubuntu/
sha256sum /home/ubuntu/gata_league-YYYYMMDD-HHMMSS.dump

# on the Mac
mkdir -p ~/gata-dumps && chmod 700 ~/gata-dumps
scp ubuntu@<server>:~/gata_league-YYYYMMDD-HHMMSS.dump ~/gata-dumps/
chmod 600 ~/gata-dumps/*.dump
shasum -a 256 ~/gata-dumps/gata_league-YYYYMMDD-HHMMSS.dump   # the same sum as on the server

# on the server again, once the sums match
rm /home/ubuntu/gata_league-YYYYMMDD-HHMMSS.dump
```

2. Set `REHEARSAL_PASSWORD` in `.env` — every restored account gets it.
3. Run:

```bash
npm run rehearsal:restore -- ~/gata-dumps/gata_league-YYYYMMDD-HHMMSS.dump
npm run rehearsal:check -- --before
npm run rehearsal:migrate
npm run rehearsal:check -- --after
```

`rehearsal:restore` marks the database as anonymized once the hashes, contacts
and sessions are replaced and read back; `rehearsal:check` and `rehearsal:migrate`
refuse a `gata_rehearsal` without that mark. A new restore deletes the reports of
the previous rehearsal.

`rehearsal:check -- --after` compares every column that existed before and
exits 1 when anything changed. An OK needs migrations to have been applied
between the two snapshots: with none, it says "OK, but no migrations were
applied" and nothing was tested. `output/rehearsal/report.md` also says how long
the migrations took, which stage each team got and why, which fallen players
were carried over, which matches are still half-way through, and which
technical results and rosters over eight re-rolls the administrator will have
to look at.

It exits 0 for an OK, 1 when existing data changed, and 2 when no migration was
applied between the snapshots — nothing was tested. It also requires the new
tables team_ledger, dice_rolls and match_events to be empty after migrating, and
the number of fallen players 015 carried over, per team, to equal the number
its rule finds (the check compares counts, not the players themselves). It does
this only when 015 was applied between the two snapshots.
Running rehearsal:migrate again adds a run to output/rehearsal/migrate.json
instead of overwriting it, so the report keeps the time the real run took.

Do not start the server between `--before` and `--after`: booting it writes to
`users` (below), and the comparison would call that a change. Afterwards, to
click through as any coach, start the server with `DATABASE_URL` pointing at
`gata_rehearsal` (same credentials as your `.env`, database name swapped). Coaches
sign in with `REHEARSAL_PASSWORD`. Booting resets `ADMIN_LOGIN`'s password to
`ADMIN_PASSWORD` (and its Telegram to `ADMIN_TELEGRAM`), and inserts that admin
if production's admin has a different login, so an `--after` taken later sees one
more user.

`npm run rehearsal:transitions` checks the states a site can be in at the moment
it moves from 2.1.0 to 3.0 - a preparation half done, a match begun, a
post-match past its Players step, a score sent and not answered, a challenge not
accepted. `--seed <url>` makes them on a 2.1.0 server over `gata_rehearsal`
before `rehearsal:check -- --before`; `--finish <url>` takes each to its end on
the 3.0 server once migrated, and checks the score, SPP, money and table. It
speaks only HTTP, only to this machine, and refuses a site of the other version
before writing anything. The order of the whole rehearsal is in the script's
header, `scripts/rehearsal-transitions.mjs`.

Fourteen days after day X (the release), delete the copies:

```bash
rm -P ~/gata-dumps/*.dump
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_rehearsal
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

An import changes `content/Gata` only: bring `content/Gata-ru` in step before committing (`docs/i18n-glossary.md`, "Keeping the RU vault in sync").

## Deployment

See `DEPLOYMENT.md` for deployment and handoff instructions, and its "Moving to 3.0" for the day the site moves from 2.x.

## Notes

This is an unofficial fan reference. It is not affiliated with, endorsed by, or sponsored by Games Workshop. Base Blood Bowl wording is referenced externally instead of being reproduced wholesale.

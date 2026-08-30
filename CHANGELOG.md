# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is an application, not a library, so "breaking" is judged by what a league
coach or an operator would notice: a data format that no longer loads, a URL that
no longer resolves, a deployment step that is now required.

## [0.2.0] — 2026-08-24

Stage 1 of the refactor plan
(`docs/superpowers/plans/2026-08-19-app-refactor.md`), plus the security incident
of 2026-08-22 and the nightly database backup that followed it. 92 commits.

The headline: `src/app.js` went from 7479 lines to 159. It is now a bootstrap,
and the application lives in 67 modules under `src/core`, `src/domain`,
`src/data`, `src/screens` and `src/components`.

### Security

- **Static file serving is a whitelist.** The server used to hand out any file
  under the deploy directory over plain HTTP — including `.env` with the database
  and admin passwords, and the whole `.git` directory. Only `index.html`,
  `local-preview.html` and the contents of `dist/`, `public/`, `src/` and
  `assets/` are served now; everything else answers `404` (not `403`, which would
  confirm the file exists). Path segments starting with a dot and backslashes in
  paths are refused outright. Covered by `test/static-path.test.mjs`.
- **The env file moved out of the served directory.** It lives in
  `/etc/bloodbowl-league/.env` (mode `600`, `root:root`); `BLOODBOWL_ENV_FILE`
  overrides the location. Both the server and the backup scripts read it through
  one parser.
- **Postgres is bound to loopback.** `docker-compose.yml` publishes
  `127.0.0.1:${POSTGRES_PORT}:5432` instead of every interface. A password-guessing
  run against the exposed port stopped the minute this landed.
- **Compose refuses to start without the database variables** rather than falling
  back to defaults that would silently create a differently-named database.
- Security headers and a `Content-Security-Policy` in `Report-Only` mode are
  applied at the Caddy layer. Moving CSP to blocking mode is still owed.
- Full write-up, including what the review could and could not establish:
  `docs/security-incident-2026-08-22.md`.

### Added

- **Nightly database backups.** `npm run backup:db` dumps the database, verifies
  the archive it just wrote, and keeps the seven most recent dumps; a systemd
  timer runs it every night. `npm run backup:status` reports whether the backups
  are actually current and fails loudly for a never-installed, masked or dead
  timer. Installed and verified on the server on 2026-08-22.
- **A roster domain layer** under `src/domain/`: league rules and every number
  that was scattered through the code (`league-rules.mjs`), plus roster values,
  team rules, players, progression, costs and validation. Validation returns
  violation *codes*, not English sentences, which is what let the roster warnings
  become translatable.
- **A roster storage layer** (`src/data/roster-store.mjs`): one save queue per
  team, the server's answer merged field by field instead of replacing the draft,
  every edit queued for immediate autosave, and a `beforeunload` guard while a
  request is still in flight. Save
  status is a real state machine (`idle`/`dirty`/`saving`/`saved`/`offline`/
  `conflict`/`error`) instead of a string written from six places.
- **The builder draft survives a reload.** A half-built team used to exist only in
  memory: a stray refresh threw it away with no warning. It is now offered back,
  with an explicit "start over".
- **Advancements state what they grant.** Choosing an advancement now records the
  skill or stat it gave (`advancements[].grants`), and one that the player cannot
  pay for is refused rather than silently applied.
- **Toasts and a dialog component** (`components/toast.mjs`, `components/dialog.mjs`)
  replacing 31 browser `alert()`/`confirm()` calls. Toasts live on `document.body`,
  outside the `aria-live` region that gets rewritten on every edit.
- **Changing a team's race asks first**, and says how many players it is about to
  delete. Cancelling puts the dropdown back.
- **Refusals explain themselves.** A hire or a staff stepper that cannot go up is
  `aria-disabled` with a reason in `title` and a toast on click, instead of a dead
  button that does nothing.
- **Verification tooling**: `npm run check` (unreachable functions, per-file and
  per-function size ratchets in `scripts/check-budgets.json`), `npm run smoke`
  (API round trip), `npm test` (267 tests), `scripts/mock-api.mjs` and two
  Playwright-driven browser checks. `docs/smoke-test.md` is the manual scenario.
- **A season tab is now a URL.** `#/season/standings` and friends can be linked
  and survive a reload.

### Changed

- **`src/app.js`: 7479 → 159 lines.** Reference screens, the personal area, the
  season, games, administration and player profiles moved to `src/screens/*`; the
  login modal, the route table, theme, i18n, markdown, DOM helpers and the API
  client moved to `src/core/*` and `src/components/*`.
- **HTML is escaped by default.** The `html\`\`` template tag in `core/dom.mjs`
  escapes interpolations unless they are explicitly marked raw, replacing
  by-hand `escapeHtml` calls that could be — and were — forgotten.
- **Screens tear down when you leave them.** `core/screen-lifecycle.mjs` runs a
  screen's teardown when the route changes or the screen re-registers.
- **Asset versions come from one place** and are stamped into `index.html` at
  build time, instead of three hand-maintained numbers that had already drifted
  apart.
- **The refactor status lives in one document.** `docs/refactor-todo.md` is now a
  pointer to the plan, which it had twice contradicted.

### Fixed

- **Edits made right after a save were lost.** The server's answer replaced the
  whole draft object, detaching the UI from the data it was editing. Reproduced
  by a test first, then fixed by merging field by field.
- **Autosave threw in a real browser.** `scheduleSave()` called
  `deps.setTimeoutFn(...)` as a method; the native `setTimeout` requires
  `this === window` and raised `TypeError: Illegal invocation`. 131 Node tests
  could not see it — `setTimeout` in Node does not care about its receiver. Found
  by the browser check.
- **The autosave status listener leaked on every re-render.** After ten edits
  there were eleven listeners, all writing to the same node.
- **`playerAdjustmentCost` read `player.row`** while its neighbour took `row` as a
  parameter; it worked on the view copy and threw on a raw draft player.
- **The language toggle kept offering the language you were already in**, and the
  footer date kept its old locale: the locale-dependent chrome was only refreshed
  at startup.
- **The nav highlighted the wrong section** on player profiles — the route-derived
  value was computed and thrown away, and each screen set its own.
- Numerous backup fixes found in review: an external kill can no longer orphan
  `pg_dump`, a failed write tears down the child process and the stream, a
  rotation error no longer fails an otherwise verified backup, and dump-shaped
  names with impossible dates are rejected.

### Removed

- **Two retired roster shapes.** The `roster` + `playerEdits` and fixed-length
  `slots` generations are no longer read; every saved team has been in the current
  shape for a long time, and supporting them cost a migration pass on every read.
  `scripts/check-roster-shapes.mjs` asks a live database to confirm this before a
  deploy. 43 unreachable functions went with them — two entire abandoned
  generations of the player editor.
- **Roster import and export**, including the copy buttons, the XLSX pipeline and
  `POST /api/admin/import-users`. Decision of the league owner, 2026-08-21.
- **The inducement filter**, which offered "all" and "Inducement" over a set where
  every page carries the `Inducement` tag, so both options produced the same list.
- **Filter state nothing could reach** (`teamFilters`, `starFilters`) — the UI had
  been removed long ago, the branches stayed.
- **The Zelenograd (`7ZBBL`) content vault** and the two scripts that only served
  it. Nothing in the built data referenced it.
- **`dist/` and `public/data*.json` are no longer tracked.** They regenerate on
  every build — the deploy runs it — and they made every content commit
  unreviewable.
- Dead assets: `assets/section-backgrounds/`, `drishevik.png`, `trophy.png`,
  `zbbL-ball.png` (~7 MB).

### Known gaps

Carried into the next stage, tracked in the plan:

- The server still does not validate rosters, has no optimistic locking, and has
  no migration system. The client's conflict dialog is written but unreachable
  until it does (plan task 4).
- The builder and the league roster editor are still two implementations; the
  shared pieces were extracted, the merge is task 7b, after the targeted-rendering
  work in task 8.
- Every edit still repaints the whole screen, which costs focus, scroll position
  and expanded cards (task 8).
- Seven tests fail on Windows on POSIX assumptions — permissions, symlinks, path
  separators. The product is fine; the test suite is not portable (plan step 1.6).
- A match has no fixed roster and no post-game flow (task 9).
- Restoring a backup has never been done. It is expected to work rather than known
  to (plan task 0, and `DEPLOYMENT.md`).

## [0.1.0]

The state before the refactor plan: a single-page application in one 7479-line
`src/app.js`, a bilingual content pipeline over the `content/Gata` and
`content/Gata-ru` vaults, a Postgres-backed server for accounts, saved teams,
seasons and games, and a VPS deployment behind Caddy.

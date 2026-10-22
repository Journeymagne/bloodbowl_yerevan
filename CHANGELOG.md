# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is an application, not a library, so "breaking" is judged by what a league
coach or an operator would notice: a data format that no longer loads, a URL that
no longer resolves, a deployment step that is now required.

## [3.0.0] — unreleased

The redesign. Every screen is new, built from the 0.9.1 design handoff on a
design system of its own (Golos Text and Oswald, eight palettes, the components
in `src/ui`), and a coach now runs a team through a whole season on the site:
the roster and its match records, the treasury, the dead, advancement with
dice rolled on the site, a match from preparation to post-match step by step,
friendly challenges, the league table, and the administration. The rules are the
league's own (`content/Gata/Rules`), in English and Russian, everywhere on the
site. Nothing of 2.x is left in the frontend.

Breaking, for a coach: old links still open, at their new addresses; a team
half-built in the 2.x builder is not carried over; the quick score form is gone
(results go through the post-match); a new team starts in the draft and the
administrator moves it into the season; once a match starts, a team's roster,
treasury and dead stay as they are until its post-match is finished, the
match's own records aside. Nobody has to sign in again. For an operator:
nine migrations, applied in one window with the site in maintenance — see
**Operators** below.

### Added

- **Shell and sign-in.** On the phone a header with tabs that shrinks as the
  page scrolls; on the desktop a side navigation with the current match (next
  match, match in play, a score waiting to be confirmed). A team switcher keeps
  the section when the team changes. Signing in and registering are screens of
  their own (`#/login`, `#/register`) instead of a dialog; a lockout names the
  minutes to wait, and every outcome is put in words. A guest who opened a
  coach's link is taken back there after signing in.
- **Settings** (`#/settings`). The account (Telegram, the password changed with
  the current one), the language, and the look: light, dark or the system's,
  with a palette for each. A guest gets the look, the language and the way to
  sign in. The administrator from the server's env file sees that account read
  only.
- **Teams and the draft.** My Teams (`#/teams`), with deletion after a
  confirmation; a team in a season or with friendlies cannot be deleted. A new
  team (`#/teams/new`) is a name and a race, then the draft: a 600k budget,
  positions with their limits, numbers, names, the captain and the staff of the
  race. A plus that cannot go up says why, and an overspend shows and blocks the
  save. A double click, a lost answer or a timeout never makes two teams.
- **Team overview** (`#/t/:id`). Place, points and W/D/L, team value and
  treasury; on the desktop TD and CAS difference, a search in the band and a
  mini-table. The season's match board with the rounds, the opponent and what
  the match phase asks for; team leaders by career; recent results with the MVP.
- **Roster** (`#/t/:id/roster`). A sortable table of the players: number,
  captain, the five characteristics (a changed one said in words), career SPP.
  On the phone a row opens; on the desktop the player opens in a panel beside
  it, with a search in the band.
  - SPP counters outside a match, one save per step, with the save's state in
    view, a conflict to resolve and an offline queue.
  - **Match records:** during a match each tap is a record of that match, and an
    injury is recorded the same way; an edit outside the match goes to the
    career instead. The post-match takes its statistics from the records.
  - **Missing the next match** with its reason (an injury of the Casualty
    Table, with its effect on the player, a death, or another reason), and
    back into the roster.
  - **The fallen:** a section of their own, marking a death with its cause, and
    undoing a mark made by mistake. A death from a match is undone only by the
    administrator.
  - **Hiring** from a cart (treasury, cart, what is left; free numbers for the
    rookies), **selling** at half the player's value, and cancelling a purchase
    before the next match for the full price.
  - **Player profile** (`#/t/:id/roster/:playerId`): number, name and captain;
    a fix by hand (lasting injuries, characteristics, skills, the last
    advancement undone).
  - **Advancement:** a skill by category, a characteristic, a skill instead of a
    characteristic, rolled on the site or at the table. A random skill is two
    D16 rolled at once, both usable and different, and the coach picks one; the
    site's dice are the server's, and each roll is taken once.
  - **Career by match:** each match the player played, with its events and SPP,
    a match awaiting its post-match, and a veteran's line for the time before
    the site's records.
- **Treasury and resources** (`#/t/:id/team`). The treasury and the Coach's
  Safe; re-rolls, Dedicated Fans, bribes and the medicine the race may hire
  (Apothecary, Mortuary Assistant, Plague Doctor), each by the rules of the
  team's stage and race, with the reason a plus is closed. The treasury's
  history line by line. Credit or debit with a reason, and a fix by hand.
  During a match everything here is closed; during a preparation a purchase
  says which steps it resets.
- **Team settings** (`#/t/:id/settings`): the name and the logo; the race is read
  only.
- **Matches** (`#/t/:id/matches`). The next match, results, the rest of the
  season; on the desktop the season: the board, the table and the calendar.
  «Before the match» shows each side's inducement budget (petty cash, the tier
  bonus, the treasury) and who misses the match and why.
  - **Preparation** (`#/games/:id/pre-match`): fans, weather, the roster and
    journeymen, inducements and effects, then the start. The start cannot be set
    off by a double click or a held Enter.
  - **Match in play:** the roster records the match, as above.
  - **Post-match** (`#/games/:id/post-match`), seven steps: score (with a
    concession or a technical result and its reason), income, players (events,
    the MVP, injuries from the records), roster, treasury, next match, review.
    Advancement works inside it, with the site's dice; the players who died go to
    the team's fallen. «Finish the match» applies once, however often pressed.
  - **The match page** (`#/games/:id`): a coach of either side is taken to where
    the match is now; anyone else gets the match card, and the coach who
    receives a score sent before 3.0 confirms or rejects it there.
- **Friendly challenges** (`#/t/:id/challenges`): a challenge sent with a search
  over coaches and their teams and the recent opponents, accepted by choosing
  one's own team, then played through the same preparation and post-match.
- **League table** (`#/season`), for guests too: your own row marked, the form of
  the last five, the points rule, the playoff zone, and the season calendar.
- **Opponents and coaches.** An opponent's team (`#/coaches/:uid/teams/:tid`):
  place, form, team value, TD and CAS difference, our meeting, the coach and
  their Telegram, the roster with the skills its dice rolled. A coach's profile
  (`#/coaches/:uid`): teams, «Challenge», your meetings.
- **Reference** (`#/ref`), in four groups (the match, players, teams, the
  league) with one search over every page, section and the league overview.
  Skills and traits filter by category; a skill's panel shows its category, its
  D16 face, the elite combination it belongs to and the players of your team
  who have it. Articles read with a table of contents and turn from one to the
  next; team rules list positions, costs, skills and the teams of that race in
  the league.
- **A guest's home** (`#/`): the league, signing in and registering, the top five
  of the table, the reference. A coach's home is the active team's overview.
- **Administration** (`#/administration`).
  - Coaches: a search; «Coach with a team» makes both at once, the team in the
    draft with 600k, and a temporary password from the server shown once;
    resetting a password; deleting a coach, refused while the coach has a team
    in the season.
  - The season: rounds and pairings, a manual result (played, or technical with
    its reason), the scores waiting to be confirmed; the entries, moving a team
    into the season or withdrawing it, and the number of playoff places.
  - Any team, edited in the roster's own screen in the administrator's mode:
    the treasury with a reason, the staff, the fallen added afterwards, the name
    and the logo.
- **Eight palettes**, four light and four dark, each with its mood: Perfect
  Conditions, Sweltering Heat, Blizzard, Imperial Nobility, Under the
  Floodlights, Dark Elves, Flames of Chaos, Pouring Rain.
- Everything new is in English and Russian.

### Changed

- **Addresses.** `#/my-teams` → `#/teams` (a team: its roster),
  `#/players/…` → `#/coaches/…`, `#/my-games` → `#/t/:id/matches`,
  `#/builder` → `#/teams/new`, `#/skills` and the other reference lists →
  `#/ref/…`, `#/season/administration` → `#/administration/season`,
  `#/season/registration` → `#/season`. The old ones lead to the new ones
  without a step in the history.
- **The coach's quick score form is gone.** A league or friendly result goes
  through the post-match; the administrator enters a manual result. A score
  sent before 3.0 and not yet confirmed is still confirmed by the coach who
  received it, or entered by the administrator.
- **A team has a stage.** A new team, the coach's or the administrator's, starts
  in the draft, buys Start Re-rolls (60k), and enters the season when the
  administrator moves it; a team in the season buys Team Re-rolls (120k).
  Existing teams are sorted by what they have done: a team in a running season
  or with a match played is in the season, every other one is in the draft.
- **Re-rolls:** Start and Team Re-rolls together are at most 8, on every save of
  a roster.
- **A team in a match is held.** From the start of a match until its post-match
  is finished, the team's own roster, treasury, deaths and rolls are refused
  (`TEAM_IN_MATCH`); the administrator's pages are the way to fix one.
- **A technical result carries its reason:** a win when the opponent could not
  field a team is 2 + 2 = 4 points, any other technical win 2. The same rule in
  the post-match, the administrator's manual result and a change of reason. A
  technical result from before 3.0 counts as the other reason, 2 points, as it
  did.
- **Favoured of… rolls a D8 on every advancement**, in the roster and in the
  post-match, as the league's rules say; a player who has every skill of the god
  skips it.
- The 14-player limit counts everyone on the roster, the players missing the next
  match included.
- Raise Dead is available to a side with a Plague Ridden player as well.
- Only a `401` ends a session; a refused request (`403`) no longer signs a coach
  out, and neither does a lost connection. Sessions and the token are as they
  were.
- The look, the active team and the language are kept with the account, so they
  follow a coach to another device; the browser keeps a copy for the first frame.
  A 2.x theme is carried to its nearest palette.
- A team's race cannot be changed once the team exists.

### Fixed

- The built CSS no longer loses `calc(a + b)`, so a match's bottom bar and the
  hire window keep their room above the iPhone's home indicator.
- The Russian weather table is read in the preparation.
- Skill links in rosters find their page by one rule: Animosity (All), Hatred
  (Troll) and nine more link again.
- The elite combinations' 15k surcharge compares skills by their name in the
  rules, so a skill with a parameter, such as Mighty Blow (+1), counts. A team
  value may rise by 15k for such a player.
- A post-match retried after a revision conflict compares the states by value,
  not by their JSON text.

### Removed

- **Every 2.x screen and its styles:** the builder and the saved-roster editor,
  My Games, the game page's checklists, the season screens and the 2.x
  administration, the reference's search bar, the home page; `src/styles/*`
  except the tokens, and the temporary aliases of the 2.x CSS variables.
- **Comfortaa and Nunito.** The site uses Golos Text and Oswald only.
- **The builder's draft in the browser.** A half-built team was kept in
  `localStorage`; the key is erased when `#/teams/new` opens and is not imported.
- The 2.x administration's routes `POST /api/season/admin/coaches` and
  `POST /api/season/admin/create-team`; the administration's own replace them.

### Migrations

Nine, `009`–`017`, in `server/db/migrations/`. Existing rows are not rewritten,
except the stage `009` gives every team; `015` adds rows. A rehearsal on a copy
of production (`npm run rehearsal:*`) checks every column that existed before.

- `009_team_stage.sql` — a team's stage (`draft` or `active`) and when it was
  activated; existing teams sorted by what they have done.
- `010_team_ledger.sql` — `team_ledger`, every change of a team's treasury line by
  line; it starts empty, so the history begins on day X.
- `011_fallen_players.sql` — `team_fallen_players`, the players who died, kept
  after they leave the roster.
- `012_dice_rolls.sql` — `dice_rolls`, the dice the site rolled for a player,
  kept until an advancement takes them.
- `013_user_preferences.sql` — `users.preferences`, the look, the active team and
  the language kept with the account.
- `014_match_events.sql` — `match_events`, one row per tap made during a match;
  the post-match counts its statistics from them.
- `015_backfill_fallen_players.sql` — the players who died in a 2.x post-match,
  carried into `team_fallen_players`.
- `016_match_event_mvps.sql` — the MVP among the counters of the match records,
  so an MVP corrected by hand reaches the player's history.
- `017_season_admin.sql` — `seasons.playoff_places` and
  `season_pairings.technical_reason`; the view `match_pairing_context` is
  recreated with the new column. Rolling back to 2.1.0 once reasons are set
  first needs `UPDATE season_pairings SET technical_reason = NULL`.

### Operators

- The day-X runbook is **Moving to 3.0** in `DEPLOYMENT.md`: the preparation,
  the maintenance window (dump, snapshot, merge, migrations, schema and data
  check, tunnel check, decision), the rollback before the point of no return,
  the full restore, and what follows.
- Deploy the frontend and the API together. `npm run deploy:migrate` applies the
  nine migrations after a fresh backup.
- If production has technical results by then, the administrator sets their
  reasons on day X.
- New commands: `npm run rehearsal:restore|check|migrate|transitions` (a
  migration and the states open at the move, on an anonymized copy of
  production), `npm run smoke:admin` (the administration on a running server;
  it needs an administrator's login and password), `npm run screens` and
  `npm run screens:diff` (screenshots of app states, and two sets compared pixel
  by pixel).

## [2.1.0] — 2026-10-15

Groundwork for the 3.0 move: the site can now close itself for maintenance
safely, and a deploy never changes the database without a fresh backup.

### Added

- **Maintenance mode.** `npm run maintenance:on|off|status` writes or removes
  `/etc/bloodbowl-league/maintenance.json`. While it is there, coaches see a
  maintenance page in their own palette that checks every 30 seconds and
  reloads into the site when the work is done; the API answers 503
  `MAINTENANCE`; `/api/health` keeps answering 200 and reports the flag.
  Requests from the server itself pass, so the owner can check the site
  through an SSH tunnel before reopening it.
- **Open tabs follow along.** A page left open from before the maintenance
  reloads into the maintenance page on its next request instead of failing
  every save.
- **Backup before migrating.** The deploy runs `npm run deploy:migrate`: when
  there are migrations to apply it first takes
  `gata_league-premigrate-*.dump`, which the nightly rotation never deletes,
  and leaves the schema alone if that dump fails.

### Changed

- Golos Text and Oswald (the 3.0 fonts, OFL) are self-hosted under
  `assets/fonts/ui/`; the maintenance page is their first user.

## [2.0.0] — 2026-10-06

Full match management for Gata Sevens, from preparation to post-match team
development, with a shared Matchday design across the site.

### Added

- **Pre-match checklist:** fans, weather, match roster, inducements and review.
  Both coaches confirm their preparations before starting the match. Match
  snapshots, revisions and spending receipts prevent conflicting edits and
  repeated treasury deductions.
- **Friendly challenges:** send, accept, decline or cancel a challenge in My
  Games, then open the pairing and use the same preparation and post-match
  checklists as league matches. Friendlies award no League Points and do not
  affect season standings.
- **Post-match checklist:** result, fans, player statistics and injuries, roster
  changes, finances, next-match readiness and review. Coaches select the MVP
  after rolling their own dice and may bank SPP instead of buying advancements.
  Once both sides confirm the agreed result, both teams and match records are
  updated in one transaction, with receipts preventing duplicate settlement.
- **Roster transfers:** buy and sell players, retain eligible journeymen and
  cancel an eligible new purchase. Team-specific sale rules and injury effects
  are included in the valuation.
- **Season administration:** add a coach and team during an active season without
  replacing the administrator's session.
- Unit and API smoke coverage for preparation, friendlies, post-match settlement,
  transfers, money calculations, roster viewing and coach registration.

### Changed

- Builder-style Matchday panels, typography, controls, dialogs and theme tokens
  now cover saved teams, profiles, games, checklists and season administration.
  Shared components replace repeated cards, scoreboards and checklist layouts.
- TD and CAS inputs are grouped and labelled by coach and team in result forms
  and administration. Committed teams no longer show the redundant Rules column;
  administration layouts adapt to narrow screens.
- Journeymen are optional when starting with fewer than seven players. All
  eligible Linemen, including Dwarf Linemen, are available regardless of the
  roster's maximum quantity. Kick/receive is decided at the table and is no
  longer a pre-match checklist step.
- Painting bonus is **15k**, including the rules documentation in both languages.
  Permanently hired Mortuary Assistants and Plague Doctors cost **50k** and add
  **50k** to team value; their one-match inducement price remains **100k**.
- Money is summed in integer gold pieces to preserve fractional-thousand
  transfer amounts. Treasury and Coach's Safe reject invalid balances.
- Frontend styles share common control, overlay and Matchday modules; obsolete
  styles and duplicated hidden layouts have been removed.

### Fixed

- Dedicated Fans can increase by only one after a match. Winnings show their
  attendance, touchdown and applicable bonus components.
- Lasting injuries no longer count as purchased characteristic advancements.
  Missing-next-game status and temporary players are handled during settlement.
- Rapid roster statistic edits retain their own save snapshots, including edits
  made while another save is in flight.
- Post-match finance projection refreshes correctly, and opening an advancement
  choice does not mark an unmodified player statistic as edited.
- Game logo responses no longer attempt a second HTTP response.
- Built CSS preserves descendant spaces before pseudo-classes such as `:is()`
  and `:where()`, keeping form controls consistent with the source styles.

### Upgrade

- Apply database migrations **005–007** with `npm run db:migrate`, rebuild with
  `npm run build`, and restart the application server. Deploy the frontend and
  API together: the new checklist screens require the new routes and tables.
  The main-branch deployment workflow performs these steps automatically.
- Existing games without checklist snapshots retain their legacy result forms.
  Existing saved rosters remain supported; no database reset is required.
- Mercenary inducements remain unavailable pending a league ruling.

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

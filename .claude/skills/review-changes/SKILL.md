---
name: review-changes
description: Review this repo's changes (the branch against main by default, or a commit range, or the uncommitted work) for bugs, performance, copy-paste leftovers, consistency with the rest of the app, the design system, i18n, accessibility, tests and docs; run the project's checks against a clean baseline; report findings by severity and list refactor ideas for the user to approve. Use when the user asks to review, check or audit changes before a commit, push or PR.
---

# Review changes (Gata Blood Bowl League)

Review what changed, report what is wrong, and propose what could be better. This is a review: **change nothing**
— no fixes, no refactors, no writes to the local database — unless the user asked for that in the same request.
Reading and running read-only checks is fine; so is `npm run build`, though it rewrites the generated `dist/` and
`public/data*.json` (git ignores them: nothing of the user's work changes).

## 0. Scope and git

- git: `git` from PATH, else GitHub Desktop's (this Windows machine has no git on PATH; the version folder changes
  on updates). Shell variables do not survive between commands, so **begin every command that uses `$g` with this
  line** — the baseline below included:

  ```powershell
  $g = (Get-Command git -ErrorAction SilentlyContinue).Source; if (-not $g) { $g = (Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" | Select-Object -Last 1).FullName }
  & $g status --short
  ```

- Target and **base** (the commit the review compares against):
  - no argument, or a branch name (`main`): the current branch from where it left that branch, plus any uncommitted
    work. The base is `merge-base <branch> HEAD`, not the branch's tip — a `main` that moved on since would show its
    own new commits as changes of this branch, reversed, and give the baseline code this branch never had.
  - a commit (`HEAD~3`, a hash): that commit is the base, and the review covers everything after it up to the
    working tree.
  - a range `A..B`: the diff below compares the base with the working tree, so it only holds when `B` is what is
    checked out (usually `HEAD`). Otherwise review it with `diff A B` and `show <commit>` per commit, read files with
    `show B:<path>`, and skip the checks — they would run on the checked-out code, not on `B`; say so in the report.
  - `uncommitted`: the work not committed yet; the base is `HEAD`.
  - **a branch stacked on another PR's branch** not merged yet (`imp/UIv2-update-p2` on `…-p1`): the merge-base with
    `main` would bring the parent's commits in, which have their own PR. The base is the parent's tip
    (`origin/<parent>`); check it has not moved past what this branch stands on
    (`rev-list --count HEAD..origin/<parent>`), and name the base in the report.
- For a branch, check that it still stands on the latest `main` and that the remote has what is reviewed
  (`fetch` reads, it changes nothing local):

  ```powershell
  & $g fetch origin --quiet
  & $g rev-list --count HEAD..origin/main      # main's commits the branch lacks: 0, or say how many
  & $g rev-list --count "@{u}..HEAD"           # commits not pushed (none when the branch has no upstream)
  & $g rev-list --count "HEAD..@{u}"           # commits on the remote not here: review those too, or say so
  ```

  When `main` moved on, the review still compares against the merge-base, but the merge may conflict and the
  checks ran without `main`'s new code: say so in the report and suggest merging `main` in (or rebasing) first.
- Start with `diff --stat <base>` (the working tree against the base: commits and uncommitted work together),
  `log --oneline <base>..HEAD` and `status --short`, then read every changed hunk. Read the surrounding code too, not
  only the diff: most problems are in how a change meets what was already there.

## 1. Run the project's checks

There is no separate linter: the project's own checks are the lint. Run them and report each result.

### Always

| Command | What it holds | A failure means |
|---|---|---|
| `npm run build` | data + site build into `dist/` (CSS minified) and `public/data*.json` | the site cannot ship; read the message |
| `npm run check` | `check:dead-code`: no unreachable functions, unused named imports within a ratchet budget; `check:references`: every call reaches a real import; `check:structure`: files (stylesheets too) and functions within their line limits — the limits and budgets are in `scripts/check-budgets.json` | a dead function or import, a broken import, a file or function to split |
| `npm run i18n:check` | `check-i18n-glossary`: the EN and RU vaults have the same pages, 0 fallbacks; `check-i18n-strings`: every string a reader sees goes through `t()` | a missing RU page or key, or a hardcoded string |
| `npm test` | `node --test test/**/*.test.mjs`: unit, DOM (fake-dom), CSS-value and contrast tests | see the baseline below |

### The test baseline

Some tests fail on this Windows machine whatever the change (line endings, Linux-only file and browser tests). Report
only failures the change **adds**, against a baseline run at the base — never by stashing over the user's work:

```powershell
# A clean checkout of the base beside the repo, with packages of its own.
$g = <the line from §0>
$wt = "<scratchpad>\review-base"   # always under the scratchpad, never inside the repo
Remove-Item "<scratchpad>\baseline.txt" -ErrorAction SilentlyContinue   # an earlier review's must not pass for this one's
# An earlier review stopped half-way: a worktree git still knows, or a folder it no longer does.
if (Test-Path $wt) { & $g worktree remove --force $wt 2>$null; if (Test-Path $wt) { Remove-Item $wt -Recurse -Force } }
& $g worktree prune
& $g worktree add --detach $wt <base>
Push-Location $wt
npm ci --prefer-offline --no-audit --no-fund | Out-Null   # needs the network when the npm cache is empty
if ($LASTEXITCODE) { "NO BASELINE: npm ci failed" } else {
  npm run build | Out-Null
  if ($LASTEXITCODE) { "NO BASELINE: the build failed" } else {
    # -Width: Out-File wraps at the console's width, and a long name wrapped at another point reads as another test.
    npm test 2>&1 | Select-String "^✖ " | Out-File -Width 4096 "<scratchpad>\baseline.txt"
  }
}
Pop-Location
& $g worktree remove --force $wt   # leave this line out when screenshots are planned: see below
```

- When the review takes screenshots, the `before` set is served from this worktree: keep it until that set is taken,
  then remove it (`& $g worktree remove --force $wt`). Remove it also when the review stops early.

- **Never link the repo's `node_modules` (or any folder) into the worktree** with a junction or symlink: `git worktree
  remove --force` follows the link and deletes the real folder's contents. `npm ci` from the npm cache takes seconds.
- If `npm ci` or the build failed in the worktree, there is no baseline: say so, and report every failing test of the
  change's run as unchecked against one — never read an empty baseline as "the base had no failures".
- Two full test runs take minutes: start the baseline in the background (run_in_background) and read the diff while
  it runs.

Then run `npm test` in the repo the same way and compare the two sets of `✖` lines (strip the timings). Report the
new ones by name; mention any baseline failure the change fixed.

A test that fails because it pins the old behaviour is not a bug in the change: say which test, and whether its name
and messages need updating with its assertions.

Tests that need PostgreSQL are skipped unless `GATA_TEST_DATABASE_URL` points at one (they make temporary
databases of their own). If server or DB code changed and the Docker database is up, offer to run them; otherwise say
they were skipped.

### By what changed

Read-only checks run without asking. Those marked **writes** create or change rows in the local database: list them
with their command and ask before running any.

| The change touches | Check | Needs |
|---|---|---|
| `server/db/migrations/**` | `npm run db:migrate -- --check` (what is pending, read-only). An applied migration is never edited — a new numbered file instead. Applying it is `npm run db:migrate` (**writes**) | the local database |
| roster storage (`src/domain/roster/**`, the roster's save path) | `node scripts/check-roster-shapes.mjs` (read-only) | `DATABASE_URL` |
| `server/**`, `src/data/**`, an API route | `npm run smoke` (**writes**: a `smoke-<timestamp>` account, a team) | `npm run postgres:up`; the site running the change: `npm start` in another terminal, started (or restarted) after the change's `npm run build` — a server left running from before serves the old server code and the old `dist/`, and the smoke passes on code it never ran; `APP_URL` local only |
| pre-match screens or domain | `npm run smoke:pre-match` (**writes**) | as above; `SMOKE_BASE_URL=http://localhost:3002` (its default is 3003) |
| friendlies / challenges | `npm run smoke:friendly` (**writes**) | as above; `SMOKE_BASE_URL=http://localhost:3002` |
| post-match screens or domain | `npm run smoke:post-match` (**writes**) | as above |
| administration | `npm run smoke:admin` (**writes**) | `APP_URL` (required, no default) plus `SMOKE_ADMIN_LOGIN` and `SMOKE_ADMIN_PASSWORD` |
| visual changes (CSS, markup) — optional | `npm run screens -- <states.json> --out output/screens/<name>/after` against the site built from the change (its server, or the mock, restarted after the build, as for the smoke); the `before` set against a site served from the base's worktree (built there, its server on another port — the states file's address set to it); then `npm run screens:diff -- <before> <after>` | local Chrome; both servers running. Without a `before` set, take the `after` set alone and say so |
| `content/Gata/**` | the matching `content/Gata-ru/**` change exists; `i18n:check` shows equal page counts and 0 fallbacks | — |

For screenshots, the states files of the redesign are `docs/redesign/screens/rd-*.json` (pick the one that covers
the screen: 390 and 1440 px, light and dark); a screen none covers needs a states file of its own — offer to write one.
Read the file's addresses first to know which server it needs: `localhost:3002` is the real site (`npm start`);
`5174`, `5175` and `5176` are `scripts/mock-api.mjs` (a signed-in coach, the same coach as an administrator with
`MOCK_ADMIN=1`, an empty coach with `MOCK_EMPTY=1`; `MOCK_PORT` picks the port, the configs are in
`.claude/launch.json`), which needs `npm run build` first and no database. Other ports in older files are one-off
servers. Never edit a tracked states file for a review: when its ports need changing (those, or the `before`
server's), copy it to the scratchpad, change the copy and run that.

The smoke scripts and `preview:seed` refuse a non-local site or database by design. Smoke accounts pile up in the
local database (`DELETE FROM users WHERE login LIKE 'smoke-%';` clears them — also a write, ask first).

If a check could not run (no Docker, no Chrome, the site not started, a write not approved), say so in the report and
give the command, rather than skipping it silently.

### The manual pass

What no script covers is rendering. For a UI change, list the relevant lines of `docs/smoke-test.md` §2 (Reference,
Builder, Saved roster, Data-loss scenarios, Season and games, Admin, Accessibility spot check) as a short checklist for
the user, each with the address to open on `http://localhost:3002` — after `npm run build` and a hard refresh, since
`npm start` serves `dist/`. Include both widths and a dark palette where the change is visual.

## 2. Bugs

- Logic and edge cases: empty lists, null/undefined data, a value of 0, one item, many items, a long name, Russian
  text (longer words).
- State across redraws: the screens patch the DOM (`patch`, `drawKeepingFocus`). State kept only in the DOM
  (an open `<details>`, a toggled class) is lost on the next draw — it belongs in the visit's/sheet's state.
  Keyed nodes (`data-key`) keep focus; a node that moves to another parent loses it.
- Both widths: phone (≤900px) and desk (≥901px) are often different markup, not only CSS. Check each.
- Both modes: a look that depends on a token can differ per palette and mode (`src/styles/tokens.css`); contrast
  itself is §4's.
- Handlers: a new `data-*` button must be wired, and composed handler objects must not overwrite each other
  (`{...a, ...b}` silently drops `a.onX` when `b` has one too).
- Async: answers that arrive after the screen was left, double presses, a save in flight.
- Security in the page: every value put into a template string goes through `escapeHtml`; no inline handlers or
  styles (CSP).
- Data already stored: a change to the shape of what is saved — a roster, a draft, a pre-match or post-match state,
  a preference, anything in `localStorage` — must still read what the database and the browsers already hold. The
  project upgrades old shapes as it reads them (`normalizeDraft`, `upgradePreparation`): say whether the change needs
  such an upgrade, or a migration.

### The server (`server/**`)

- SQL takes its values as parameters (`$1`, `$2`), never built into the query string.
- Every new or changed route checks who may call it: the team's owner, the opponent, the administrator
  (`is_admin`), a guest — and refuses the others with the route's usual error.
- Input is validated before it is used: types, ranges, lengths, ids that belong to the caller.
- A write that reads before it writes takes its rows under a lock in one transaction, as the existing code does
  (`FOR UPDATE`, `server/db/transaction.mjs`); a retry or a second tab must not apply it twice.
- No query in a loop where one query would do (N+1).

### What else is in the diff

- No secrets: tokens, passwords, connection strings, `.env` values, a real user's data in a fixture.
- No stray files: generated output (`dist/`, `public/data*.json`, `output/`), screenshots, scratch scripts, logs,
  editor files — staged or about to be.
- No unrelated changes mixed in (a drive-by rename, a reformatted file): name them and suggest a commit of their own.

## 3. Performance

- Listeners and observers released when the screen is left (`onScreenLeave`, `listenerGroup`, `delegate` offs).
- No repeated work per draw that could be done once (lookups in loops, re-reading the reference, re-parsing).
- No extra fetches: a redraw must not refetch what the state holds.
- Large DOM or CSS that scales with data (e.g. rendering hidden copies for both widths when one would do).

## 4. Accessibility

- Focus: visible on every control, in a sensible order; after a redraw or a closed sheet it lands somewhere a
  keyboard can go on from (the page's h1 at worst), never on the body.
- Names: an icon-only button has an `aria-label`; a toggle has `aria-expanded` (and `aria-controls` when it points
  at a region); a dialog is named by its title.
- A closed control stays in reach and says why: `aria-disabled` with a `title`, and a toast when pressed (the
  roster's K7 pattern) — not a bare `disabled` that swallows the press.
- Targets: 44px to a finger up to 900px, 24px at least from 901px (WCAG 2.5.8).
- Contrast: text 4.5:1, control edges and icons 3:1, in every palette (`test/helpers/contrast.mjs` measures it).

## 5. Copy-paste leftovers

- Junk or half-edited lines, duplicated blocks, a test helper that is defined but never used.
- Stale comments describing the old behaviour (a renamed class, a removed button, a moved block).
- Unused imports, CSS rules for classes no markup draws any more, i18n keys nothing reads any more (removed from
  **both** `en.json` and `ru.json`).
- Tests whose names or messages still describe the old behaviour after their assertions were updated.

## 6. Consistency with the rest of the app

For every visual or wording change, grep for the same pattern elsewhere and say whether it should follow. Compare
against the shared source, not remembered values:

- Same kind of control, same look: rows' label and value (`src/ui/list-row.css`, `src/ui/text-field.css`, the team
  settings' rows), "Show N more" (`.g-more` in `src/ui/button.css`), link-style buttons, chips
  (`src/ui/skill-chip.css`), counters (`renderResourceCounter`), icon buttons, disabled states, dividers.
- Same word for the same thing across screens and in both languages.
- Shared helpers over new local ones (`renderButton`, `renderSheet`, `common.*` i18n keys for button words).

## 7. Design system

The design system here is `src/styles/tokens.css` (colour, space, radius and size tokens, per palette and mode) and
the shared components in `src/ui/` (`*.mjs` + `*.css`).

- A new literal size or colour that repeats, or that belongs to a component, is a token or component candidate —
  propose it (don't add it silently).
- Never change a global token to fix one place (e.g. `--size-touch` is every control's touch target); propose a
  component-level token instead, and ask first.
- A pattern now used in two or more screens with its own CSS each is a candidate for a `src/ui/` class.
- A change to a shared component (`src/ui/*.css`) reaches every use of it: grep its class, and check each place,
  above all a negative margin or a widened target, which can lay one control's press area over another's (a phone
  fold's −6px once reached over the skill list under the advancement's «About …»).
- Read the component's own rule before changing its look: a row's label/value weights (`ui/list-row.mjs`: "a label,
  and its value heavier"), a closed control (only a main button takes the `--disabled` fill; quieter ones are dimmed
  in their own colour, as `.g-btn:disabled`). A change against it is a finding even if it was asked for earlier — say
  so and ask.

## 8. i18n and content

- Every new user-facing string goes through `t()` / `data-i18n*` with keys in both `en.json` and `ru.json`
  (CLAUDE.md §2); RU wording follows `docs/i18n-glossary.md`.
- A changed or new UI term updates `docs/i18n-glossary.md` too: its row in «3.0 UI terms», or a note above the table
  that quotes the old words (the glossary's own rule: "When a dictionary word changes, change its row"). Grep the
  glossary for the old EN and RU words of every changed key; a stale row is a finding.
- A change under `content/Gata/` needs the matching change under `content/Gata-ru/` (CLAUDE.md §1).

## 9. Tests and docs

- New behaviour has a test; a changed one has its test changed to say the new behaviour — not deleted, and not
  loosened until it says nothing.
- Docs that describe what changed are updated: `docs/project-context.md` (features, routes, run modes),
  `docs/smoke-test.md` (a manual step that no longer matches), `CLAUDE.md` (a contributor rule).

## 10. Comments and notes

A comment earns its place only by saying what the code cannot: a non-obvious reason, a constraint, a workaround, a
link to where a value must stay in sync. List every comment the change adds or edits (`diff -U0 <base>`, the added
lines with `/*`, ` *` or `//`) and judge each one:

- **Added: strict.** Remove it if it restates the code, narrates the change («now we…», «fixed…», «the owner asked…»
  with nothing else), or describes a layout or markup the code already spells out. A JSDoc that paraphrases a short
  function's output is duplication too: `/** The tab: «Roster · Gata Blood Bowl League», or the name alone */` over a
  two-line `document.title = heading ? … : …` says nothing the code doesn't.
- **Edited: moderate.** An existing comment usually stays, but shorten it to its reason when it can be.
- **A trimmed comment is judged again.** Shortening is not enough: if what is left only restates the code, it goes.
- The file's dense prose style, or a «(the owner, date)» provenance note, is no reason on its own to keep one.
- **A pointer a reader cannot follow is no provenance.** «item 14 of PR 1», «review round 4», «Fresh-eye review of
  PR 2» name local plan docs (`docs/next-prs/` is never committed) or a review that leaves no trace in the repo. Keep
  the reason, drop the pointer, or write «(the owner, date)». Tests too: their comments and assertion messages are
  read the same way.

## 11. Build gotchas

- The CSS minifier strips spaces around `+`, breaking `calc(a + b)` — use `calc(a - b)` / `calc(x * -1)`.
- CSS changes reach the local site only after `npm run build` and a hard refresh.
- `src/screens/ref/prose.css` may only style `.g-prose…` selectors (a test enforces it).

## 12. Verify before reporting

Each candidate finding is a claim to check, not a result. Before it goes in the report, re-read the code behind it
(the whole function, its callers, the CSS that applies, the test that covers it) and confirm the failure scenario
really happens. Drop what does not hold; mark what could not be confirmed as "unconfirmed" rather than stating it as
a bug.

**A finding that goes against pinned behaviour is a question, not a fix.** When the change a finding asks for
contradicts a test that pins the current behaviour, or another screen that does the opposite on purpose, report both
sides and ask the owner which holds before anything changes. In part 2 a round hid another coach's written absence
reason on one page while «Before the match» showed it (and its test pinned that); the owner chose to show it, and
the hiding had to be undone.

## 12a. More rounds with a fresh eye

When asked for another round "with a fresh eye", hand it to a subagent that has none of this session: it reads
nothing but what it is told. Brief it with: read this SKILL.md and CLAUDE.md and follow §0–13; the scope (the base
and why); the git line of §0; which checks to run or which already passed (with their counts); the mock to start if
it needs the running app; where to put its files (the scratchpad, nothing in the repo); review only, no edits; what
earlier rounds fixed, and what was **decided on purpose** and not to be reported again unless actually wrong; what to
look at hardest (what the latest fixes could break); the report's shape and length. Then verify each of its findings
yourself (§12) before fixing it — its report is a claim, like any finding.

## 13. Report

Start with what was reviewed (range, number of files), then the checks as a short table: each command and its result
— passed, failed (with the message), new test failures against the baseline (named), or not run and why (with the
command) — and, for a branch, whether it stands on the latest `main` (or its parent branch, for a stacked one) and
matches its remote (§0). Then one line:
the number of must-fix findings and what blocks a merge (or "nothing blocks a merge"). Then the manual-pass
checklist, when the change is visual.

Then the findings, most severe first, each with `path:line` as a clickable link, what is wrong, a concrete failure
scenario, and a severity: **must fix** (wrong behaviour, a crash, lost data or state, a security or accessibility
failure, a broken check) or **nice to have** (consistency, polish, cleanup). Group them as:

1. **Bugs** — the server's and stored data's among them.
2. **Performance**
3. **Accessibility**
4. **Copy-paste and leftovers**
5. **Consistency** — where else the same thing differs.
6. **Design system** — tokens or components worth adding or reusing.
7. **Tests and docs**
8. **Comments** — to delete or fix.

Say plainly when a group has nothing.

Last, **Refactor suggestions**: a numbered list, each with what it would change, why, and its size (small / medium /
large). Ask which, if any, to apply — and which findings to fix — and do not apply them unasked.

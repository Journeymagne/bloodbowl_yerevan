# Club journal redesign verification

## Result

Independent finish-review disposition: **APPROVED for the F1/F2 correction batch.** The reviewer assessed source and screenshots; browser interaction results were supplied by the implementation agent. The bundled role definitions were unavailable, so fresh ordinary subagents performed the required reviewer and documenter roles.

| Finding | Verdict | Evidence |
| --- | --- | --- |
| F1: populated home standings overflow mobile | Resolved | Summary table resets the inherited 760px minimum. Long bilingual names wrap; document/viewport widths match at 360 and 390px. |
| F2: drawer opening loses focus | Resolved | Visibility changes immediately, Close receives synchronous focus, Tab containment recovers external focus, Escape/Close restore the toggle, desktop resizing clears inert states. |

## Checks

- `npm run build`: passed, 292 pages per locale and zero fallbacks.
- `npm run i18n:check`: passed.
- `npm run check`: passed; no unreachable functions or broken imports, source budgets respected.
- `node --test test/home-season.test.mjs test/reference-search.test.mjs`: 6/6 passed.
- `npm test`: 351/353 passed. Existing `test/backup-status.test.mjs` symlink tests at lines 754 and 772 use 2026-08-22 dump filenames; the current-date age check rejects them. No backup/server implementation changed.
- `git diff --check`: passed.
- Impeccable static detector: one run, `[]`.
- Direction contract seed 22546323 survives in `dist/index.html`.

## Browser evidence

First pass covered home, search results and rule navigation, reference hub, season, builder and saved roster across 360/390/768/1024/1440px; EN/RU and light/dark themes.

Correction captures under `.codex_tmp/design/` are clean viewport screenshots: `verdict-mobile-390-ru.png`, `verdict-mobile-360-en.png`, `verdict-menu.png`, `verdict-desktop.png`, `verdict-desktop-light-ru.png`, `verdict-mobile-light-ru.png`.

At 390px the summary table is 316px wide; at 360px it is 286px. No document overflow. Keyboard checks: Shift+Tab from Close wraps to language toggle; Tab wraps back; Escape restores menu toggle and removes main inert; Enter opens with Close focused; resizing an open drawer to desktop removes both inert states.

Reduced motion was not explicitly emulated. Production backend workflows were not exercised against a live database. Local API fixtures are marked synthetic and are excluded from the build. Static production preview at port 5177 therefore shows the real unavailable-season state; the reference data is available.

## Scope

The initial design pass did not deploy or commit; the existing staged AGENTS.md was preserved. Global design rules are documented in DESIGN.md; home strategy lives in `.impeccable/surfaces/src-screens-home-mjs.md`.

## Release preparation

The user subsequently requested fixing the remaining tests, building a local
preview connected to production, and submitting all work in a separate branch/PR.

- Backup CLI fixtures now derive fresh/future dump names from runtime; pure date-boundary tests retain their injected fixed clock. Backup behavior is unchanged.
- `npm run preview:prod` builds and serves the local frontend at `http://127.0.0.1:5180`, proxying API requests to the documented production HTTPS origin. The README explains real-data writes and isolated browser sign-in.
- Eight HTTP integration tests cover local assets/private paths, upstream method/query/body/Bearer forwarding, status/error handling, origin/host rejection, redirect rejection, timeouts and HEAD/static write behavior.
- Final complete suite: **364 passed, 0 failed**. Build, i18n and structure checks pass.
- The local proxy returned production health and season data; browser inspection displayed the real Season 1 standings. Only public GET requests were performed against production. Authenticated mutations are covered using a local upstream fixture, not live accounts.
- An independent code reviewer found no critical/important issues and marked the scoped preview/test changes ready for PR (74 targeted tests passed).
- No production deployment is part of this submission.

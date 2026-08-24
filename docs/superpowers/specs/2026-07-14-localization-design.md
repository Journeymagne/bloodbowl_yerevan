# Localization (EN/RU) Design

## Goal

Add a language switcher to the Gata Blood Bowl League reference site, supporting English (current, default) and Russian. Two kinds of text exist on the site, and they're translated differently:

- **Interface text** (navigation, buttons, labels, auth modal, legal notice, empty states, etc.) — translated in full.
- **Reference content** (rules, casualties tables, inducement descriptions, skill/trait descriptions, star player write-ups — generated from `content/Gata`) — translated, *except* for key Blood Bowl terms, which always stay in English regardless of locale: team/race names, skill and trait names, player positions, star player names, inducement/special-rule names, and core stat shorthand (MA/ST/AG/PA/AV/SPP/TV/GP/CAS/etc.).

This is a two-layer problem: a UI-string i18n system, and a parallel-content-vault translation, sharing one locale switch.

## Non-goals

- No changes to `content/7ZBBL` — that's a separate league's content, unrelated to this feature. The existing `SITE_CONTENT_DIR` env var (which switches between leagues) is untouched; locale is an orthogonal axis.
- No server-side rendering or URL-based locale routing (e.g. `/ru/...`) — this is a client-side toggle only.
- No automated test suite is being introduced; validation is manual (this repo has none today).

## Architecture

### Layer 1: Interface strings

- New `src/i18n/en.json` and `src/i18n/ru.json`: flat, namespaced key → string dictionaries (e.g. `nav.overview`, `builder.saveChanges`, `legal.disclaimer1`, `auth.login`).
- A `t(key)` helper added to `src/app.js`, resolving from whichever dictionary matches `state.locale`.
- Static markup in `index.html` gets `data-i18n="key"` attributes (plus `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria-label` variants for non-text-content attributes) so a startup routine can walk the DOM and populate them.
- Every hardcoded UI string inside `app.js`'s template-literal view functions (nav labels, table headers, button text, status messages, the hardcoded legal-page copy, etc.) is replaced with `${t('key')}` calls. This is a full sweep of the ~3850-line file — see Phasing below.
- Content fields pulled from `state.data` (team names, skill descriptions, rule text, etc.) are **not** run through `t()` — they come pre-translated per-locale from `data.<locale>.json` (Layer 2).

### Layer 2: Reference content

- New parallel Obsidian vault `content/Gata-ru/`, mirroring the exact folder and file structure of `content/Gata/` — same filenames, same organization (Rules, General Information, Inducements, Skills and Traits, Star Players, Teams).
- Filenames stay identical between vaults (e.g. `Block.md`, `Griff Oberwald.md`), because `build-data.mjs` derives identifiers (skill name, star player name, team name, etc.) from filenames/existing structured parsing — so identifiers are structurally guaranteed to remain English without any special-casing in the translated prose.
- Only the Markdown body text is translated. Any key term that appears mid-sentence in a translated paragraph (e.g., "requires the `Block` skill") is kept in English per the glossary (see below).
- `scripts/build-data.mjs` is extended to build from both vaults in one pass, producing `public/data.en.json` and `public/data.ru.json`. `public/data.json` is also written (a copy of the `en` output) for backward compatibility with anything still pointing at the old filename.

### Glossary enforcement

- A checked-in `docs/i18n-glossary.md` documents the term categories that must never be translated (listed above under Goal).
- **Structural check (mechanical):** since identifier fields (`name`/`title`) are filename-derived, a small script diffs those fields between `data.en.json` and `data.ru.json` to confirm they're identical — this is the primary safety net and can be run as part of the build or as a standalone check.
- **Prose-level check (manual):** whether a key term embedded inside a translated paragraph was left in English is not mechanically verifiable. The implementation plan should include a manual spot-check pass across a sample of each content category (Rules, Inducements, Skills and Traits, Star Players, Teams) rather than 100% line-by-line review.

## Locale detection, persistence, and switching

- **Default for new visitors:** if `navigator.language` starts with `ru`, default to `ru`; otherwise default to `en`.
- **Persistence:** once the user interacts with the toggle, the choice is saved to `localStorage` under `gata-league-locale` (alongside the existing `gata-league-theme` key) and overrides `navigator.language` on all future visits.
- **Switching UX:** the existing disabled `#lang-toggle` button (`index.html:80`) becomes live, cycling EN ⇄ RU. On click:
  1. Update `state.locale`.
  2. If `data.<locale>.json` isn't already cached in memory, fetch it.
  3. Re-run the `data-i18n` DOM pass for static chrome.
  4. Re-render whatever view is currently active, via the same re-render path the existing router uses.
  - No full page reload; current route, open filters, and scroll position are preserved. Both locale payloads are cached client-side after first switch, so switching back is instant.

## Build/deploy pipeline changes

- `scripts/build-data.mjs`: loop over `content/Gata` and `content/Gata-ru`, writing `public/data.en.json` and `public/data.ru.json` (plus `public/data.json` as a copy of `en`, for compatibility).
- `scripts/build-site.mjs` (used for the static `dist/local-preview.html` inlining path): instead of inlining a single `data.json` as `window.__REFERENCE_DATA__`, inline both locales as `window.__REFERENCE_DATA__ = { en: {...}, ru: {...} }`. `app.js` prefers this inlined object at startup if present, falling back to `fetch("public/data.<locale>.json")` otherwise.
- No changes needed to `.github/workflows/deploy.yml` or `server/server.mjs` — they run `npm run build` / serve static files from `public/` agnostic to how many JSON files exist there.

## Execution phasing

Given the volume of work (~38k words across 299 Markdown files, plus a full string-extraction sweep of a 3850-line frontend file), implementation proceeds in stages:

1. **i18n infrastructure** — `t()` helper, `en.json`/`ru.json` UI dictionaries (seeded with keys, English values only at first), locale detection/persistence, live `#lang-toggle` wiring, dual-locale data loading/caching in `app.js`.
2. **UI string sweep** — replace hardcoded strings across `app.js` and `index.html` with `t()`/`data-i18n`, and translate the UI dictionary into Russian. After this phase, the interface is fully bilingual; content is still English-only in both locales.
3. **Content translation** — translate `content/Gata` into `content/Gata-ru`, section by section (Rules, General Information, Inducements, Skills and Traits, Star Players, Teams), following the glossary. Given the volume, this is expected to be dispatched as parallel batches per section rather than one linear pass.
4. **Build pipeline** — extend `build-data.mjs` for dual JSON output, wire the dual-locale inlining in `build-site.mjs`.
5. **QA** — run the structural glossary-diff check; manually spot-check translated prose per content section; verify locale switching preserves route/filters/scroll with no reload; verify search behaves correctly against whichever locale's data is loaded; verify Team Builder / My Teams (which mix content data with user-entered data) render correctly in both locales.

## Testing / validation approach

This repo has no automated test suite (it's a static-site generator plus a vanilla-JS frontend); validation is manual: run `npm run dev`, exercise both locales across every route, confirm team/skill/position/star-player names stay in English in both locales, and confirm the language toggle preserves app state.

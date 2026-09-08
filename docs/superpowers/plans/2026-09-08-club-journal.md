# Club journal redesign implementation plan

**Goal:** Make the existing Gata site a coherent, responsive tournament centre for current players.
**Spec:** `PRODUCT.md`, `docs/design-review-2026-09-08.md`, approved direction in `.impeccable/decisions/selected.json`.
**Architecture:** Keep ES modules, routes and domain logic. Replace the visual tokens and shell at their sources; isolate new home markup and frame interactions in components. Reuse the existing season API. Keep six saved theme IDs, EN/RU and all roster workflows.

- [x] Replace duplicated theme recipes with semantic surfaces, text, action and state tokens. Self-host Oswald and Golos Text with OFL licences. Keep existing six IDs and system preference behavior.
- [x] Replace desktop sidebar with compact masthead navigation; preserve mobile drawer. Put theme/language settings in navigation and give mobile search its own row. Add current-page semantics and drawer focus handling.
- [x] Implement the player-first home: season entry, compact real standings, match and team actions, four quick reference links, secondary league handbook. Loading/error/empty states keep all navigation available; stale asynchronous responses must not overwrite another screen.
- [x] Make global reference search work from every screen, with real translated result titles and clearing on navigation. Verify query matching and URL/HTML escaping.
- [x] Group the reference index by match-day tools and catalogue; unify components, spacing and typography across season, roster, forms, tables and dialogs. Repair hardcoded colors that violate light themes.
- [x] Replace width assumptions in dense editor/filter grids with fluid sizing; retain appropriate mobile roster presentations and local table scrolling.
- [x] Verify build, EN/RU parity, structural checks and unit tests. Inspect desktop/mobile, both locales/themes, main flows, menu, search and dense rosters in a batched browser pass. Fix material issues and confirm once.
- [x] Run the Impeccable detector once, obtain an independent finish review, fix material findings and document the implemented design system.

## Composition and asset inventory

The user chose the club journal world on the decision page and explicitly asked
to continue. Its two-column season workspace is the implementation anchor;
the generated probes clarify density and mobile translation, not a new brand decision.

| Ingredient | Medium | Commitment |
| --- | --- | --- |
| Compact club masthead | HTML/CSS + supplied emblem | Horizontal desktop navigation, accessible phone drawer |
| Condensed headings / readable body | Self-hosted Oswald / Golos Text | Cyrillic and Latin; display belongs to headings only |
| Season area and standings | Semantic HTML, existing API | No invented dates/scores; honest unavailable/empty states |
| Team and quick rules rail | HTML links and consistent SVG arrows | Secondary on desktop, stacked on phone |
| Palette and interaction | CSS tokens | Navy, cool light surfaces and copper; dark variants remain usable |
| Reference and roster content | Existing data and semantic components | No rasterized controls or text |

No photographic or illustrated region is required by the approved sketch.
Generated mockups are review artifacts; they are not shipped as interface assets.

## Validation and finish

- Production build: 292 pages in both locales, 0 English fallbacks in Russian.
- i18n and structure/import/dead-code checks pass. Six added home/search unit tests pass.
- Full suite: 351/353 pass. Two unrelated backup-status symlink fixtures use a fixed 2026-08-22 dump timestamp and fail the age check on 2026-09-08. Backend code was not changed.
- Browser coverage: 360/390 phones, 768/1024 tablets and 1440 desktop; EN/RU, dark/light, search-to-rule navigation, references, season, builder and saved roster. API-dependent examples use clearly synthetic local fixtures.
- Independent reviewer: APPROVED for F1/F2 correction batch; mobile summary table overflow and drawer focus are resolved. Reduced motion was not explicitly emulated; focus is synchronous and independent of animation.
- Static detector ran once with no findings. Design system recorded in DESIGN.md and .impeccable/design.json.
- Local production preview runs at http://127.0.0.1:5177/ without the league API; honest unavailable states are expected there. No deployment performed.

## Follow-up requested by the user

- [x] Fix backup CLI fixtures tied to a historical timestamp.
- [x] Add and verify `npm run preview:prod` against the real production API.
- [x] Run full verification: 364 tests pass, plus build/i18n/structure checks.
- Submit the complete redesign, documentation, tests and preview tooling in a separate feature branch and PR; no main deployment.

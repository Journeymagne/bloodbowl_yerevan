# i18n Glossary — Terms That Stay in English

When translating `content/Gata` into `content/Gata-ru`, or writing Russian UI
strings, the following categories are **never translated**, in either locale:

- **Team/race names** — Human, Orc, Chaos Dwarfs, Amazon, Old World Alliance, etc.
- **Skill and trait names** — Block, Dodge, Mighty Blow, Regeneration, etc. (the
  name only — the description text around it is translated).
- **Player positions** — Lineman, Blitzer, Thrower, Big Guy, etc.
- **Star player names** — Griff Oberwald, Asperon Thorn, etc.
- **Inducement and special-rule names** — Bribe, Biased Referee, Wandering
  Apothecary, Lustrian Superleague, etc. (the name only — surrounding
  descriptive prose is translated).
- **Core stat shorthand** — MA, ST, AG, PA, AV/AR, SPP, TV, GP, CAS.
- **Advancement rank and type names** — Rookie, Experienced, Veteran, Emerging
  Star, Star, Superstar, Legend, and Random/Primary/Secondary/Stat. (The 3.0
  advancement sheet is a deliberate UI exception for the type names — see the
  last item under "New-UI translation sweep" below.)

**Not a league term: palette names.** The theme palettes (`theme.palette.*`) take their Russian
names from the design handoff (`Settings.html` PALETTES / the design-system README): they name a
mood, not a team or a weather result, so «Тёмные эльфы», «Имперская знать», «Идеальная погода» and
«Палящий зной» are deliberate, even though team names are never translated and the weather table in
`content/Gata-ru` uses other words. Don't "fix" them.

## Structural bold-label markers

`scripts/build-data.mjs` parses a few fixed bold-label lines out of team and
star player pages to populate structured fields (roster meta, builder costs).
When translating those specific lines, use these exact Russian phrasings —
anything else won't be recognized by the parser:

| English            | Russian (use exactly this) | Used on         |
|---------------------|------------------------------|-----------------|
| **Rerolls:**         | **Рероллы:**                  | Team pages      |
| **Apothecary:**       | **Апотекарий:**               | Team pages      |
| **League:**           | **Лига:**                     | Team pages      |
| **Special Rules:**    | **Специальные правила:**      | Team pages      |
| **Availability:**     | **Доступность:**              | Star player pages |
| **Cost:**             | **Цена:**                     | Star player pages |
| **Teams:**            | **Команды:**                  | Star player pages |

`**Name:**` and `**Special Ability:**` on star player pages are *not* parsed
into structured fields (pure display prose) — translate them freely, e.g.
`**Имя:**` / `**Персональная способность:**`.

### Table headers that drive column layout

The build also reads table header text to decide how a column is laid out:
`Qty`, `MA`, `ST`, `AG`, `PA`, `AR`, `Roll` / `Бросок`, `Trigger` / `Триггер` and dice headers
(`d6`, `2d6`, `D8`, `D16`) become narrow centred columns, and `Cost` becomes a
narrow right-aligned one. Keep these headers exactly as written. A renamed
header still renders, but the column silently loses its alignment and width —
if a new spelling is needed, add it to `CENTERED_COLUMNS` in
`scripts/lib/render-table.mjs`.

## Inducement names used as UI labels elsewhere

**Ruling from Task 6:** some inducement names double as roster-builder staff
purchase labels (e.g. "Assistant Coaches" and "Cheerleaders" are both named
inducements with their own page under `Inducements/`, *and* labels on the
Team Builder / Saved Roster staff-purchase controls). Wherever a UI label is
the same string as a named inducement, it stays in English in both locales,
everywhere it appears — not just on the inducement's own content page. Don't
translate it as generic UI copy just because it also functions as a button
label. A UI label that does *not* match a named inducement (e.g. "Dedicated
Fans," which has no corresponding `Inducements/` page) is ordinary UI copy
and gets translated normally.

## Filenames and folder names

`content/Gata-ru/` must mirror `content/Gata/`'s file and folder names
byte-for-byte. Never rename a file or folder when translating — identifiers
(skill name, star player name, team name) are derived from the filename by
`scripts/build-data.mjs`, so renaming breaks the site.

## What *is* translated

Everything else: rule explanations, casualty/weather/kick-off table effect
text, inducement descriptions, skill/trait "Rule summary" and "Gata League
change" prose, star player special-ability descriptions, and any other
narrative text. Markdown table structure, `[[wiki-links]]` targets, and
frontmatter `tags:` values are never translated (tags are filter/category
keywords, e.g. `Agility`, `Trait`, `Inducement`).

## Judgment calls established during content translation (Task 8+)

The categories above don't cover every recurring term. These calls were made
during Rules translation and should be applied consistently in every later
content task:

- **Reroll(s)** (the noun, as a resource/game term — bold structural label,
  UI copy, or generic prose alike) → "реролл(ы)", transliterated and joining
  the established RU Blood Bowl fan-community jargon family (alongside
  Drive/Turnover/Touchdown/Kick-off/Touchback below). **Superseded 2026-07-15:**
  earlier translation tasks (8-14) used "переброс(ы)"/"переброска(и)" for this
  instead; every occurrence across `content/Gata-ru/` and `src/i18n/ru.json`
  was swept to "реролл(ы)" (whole-word replacement, all case/declension
  forms) after this decision. The **verb** "перебросить" ("may reroll a
  test", used throughout Skills/Traits/Star Players rule text) is a distinct
  word — deliberately left as ordinary Russian, not converted to a
  реролл-based verb, so future translations shouldn't "fix" it to match.
  **Apothecary, used generically in prose** (not as a bold structural label,
  not as part of a named inducement) → "апотекарий", consistent with the
  structural-label translation. Named inducements built on these words
  (`Wandering Apothecary`, `Mortuary Assistant`, `Plague Doctor`) stay fully
  English as inducement names.
- **"Inducements"** (the generic category noun, not one specific inducement's
  name) — kept in English throughout, treated as an adopted term rather than
  translated inconsistently case-by-case.
- **Drive / Turnover / Touchdown** (generic rules vocabulary, not proper
  nouns) → transliterated as established RU Blood Bowl fan-community jargon:
  "дран" / "терновер" / "тачдаун" (lowercase, ordinary Russian nouns).
  "Tackle Zone" and named actions (Move, Blitz, Pass, Hand-off, Foul, Block)
  stay in English as capitalized rule-identifiers, same treatment as
  skill/position names.
- **"Kick-off"** (generic rules vocabulary, not a proper noun) →
  transliterated the same way as Drive/Turnover/Touchdown: "кик-офф"
  (lowercase, ordinary Russian noun).
- **"Fan Factor"** and **"Team Value"** stay in English, grouped with the
  core-stat-shorthand family (TV/SPP/etc.).
- **Broken export artifacts** (e.g. stray `DOCX`/footnote fragments left over
  from whatever process originally produced `content/Gata`'s Markdown) are
  carried forward verbatim, untranslated — they aren't real prose.
- **Casualty result names** (Task 9): `Badly Hurt` and `Niggling Injury` stay
  English — they recur as identifiers elsewhere in `content/Gata` (healing
  rules, specific skills/traits). `Seriously Hurt`, `Serious Injury`,
  `Lasting Injury`, `Dead` are translated normally, since they don't recur as
  identifiers outside the Casualties table. The generic noun
  "casualty/casualties" (not the `CAS` shorthand) → «травма»/«травмы».
- **Kick-off event names** (Task 9) stay English and bolded (e.g.
  `**Bribes:**`, `**Cheering Fans:**`) — several are cross-referenced by
  exact name from other pages (e.g. `Inducements/Team Mascot.md`), so all of
  them are kept English for internal consistency rather than deciding
  case-by-case.
- **Prayer names** (e.g. in `Prayers to Nuffle.md`) are translated like any
  other narrative label (not cross-referenced elsewhere as identifiers), but
  `Nuffle` itself (the deity) always stays English, the same treatment as
  the Chaos god names (Khorne, Nurgle, etc.), even inside an otherwise
  translated prayer name.
- **"Open" player state** (the Blood Bowl 2020/2025 "unmarked player"
  concept) stays English, glossed on first mention per section as
  «открытый (Open)» — same pattern as `Prone`/`Stunned`.
- **"Skill"/"Trait" the common nouns** (not a specific skill/trait's name) →
  «навык»/«черта».
- **Generic "Special Rules" category noun** (not one specific rule's name) →
  translated as «специальные правила» (lowercase) — this differs from
  "Inducements," which stays English, because the structural-label table
  above already establishes Russian as the intended rendering for this
  category (`**Special Rules:**` → `**Специальные правила:**`).
- **"Coach's Safe"** (a named house rule quoted verbatim across multiple
  files — `Rules/3. Team Management.md`, `Rules/5. Patch Notes.md`, and
  `General Information/All Gata Changes.md`) stays in English as a heading,
  the same treatment as a named special rule, even though it isn't one of
  the 8 rules catalogued in `Special Rules.md`. Its descriptive bullet
  labels underneath are ordinary prose and are translated: `Deposits` →
  «Взносы:», `Restrictions` → «Ограничения:», `Usage` → «Использование:» —
  use these exact three renderings everywhere this section recurs, for
  consistency across files.
- **"Tier 1" / "Tier 2" / "Tier 3" / "Premier League" league-tier labels**
  (Task 14, Teams): kept in English, untranslated, on the `**League:**` /
  `**Лига:**` line of every team page. This deviates from the tier-label
  translation ("Tier 1" → "Дивизион 1") that Task 14's own instructions
  proposed as an example — that example assumed `General Information/
  Leagues.md` already established a Russian rendering for tier labels, but
  it doesn't (it's a one-line description with no tier table). The real
  precedent, already committed from earlier tasks, is `General Information/
  All Gata Changes.md`, `Rules/3. Team Management.md`, and `Rules/5. Patch
  Notes.md`, which consistently leave "Tier 1"/"Tier 2"/"Tier 3"/"Premier
  League" in English throughout their Russian prose (15+ occurrences). Task
  14 follows that established precedent instead, for site-wide consistency.
  `Imperial Nobility.md`'s `**League:**` value is literally the word
  "League" in the English source (an apparent data-entry omission, not a
  real tier value) — mirrored byte-for-byte/untranslated rather than
  guessed at, per the "unrecoverable corruption" guidance below.

- **Cost/gold shorthand** (e.g. `100k`, `85k` on Inducement price tags) →
  spelled out as "N тыс." (e.g. "100 тыс.", "85 тыс."), matching the
  established rendering already used for the same figures in
  `Rules/3. Team Management.md`'s own Inducements section and every other
  translated page that quotes gold amounts (`General Information/All Gata
  Changes.md`, `Rules/5. Patch Notes.md`, etc.) — "k" shorthand is not used
  anywhere else in `content/Gata-ru`, so Inducements pages follow the same
  convention rather than introducing a one-off format.
- **"for X" qualifiers on an Inducement's price line** — "for [race/team
  type]" (e.g. "or 30k for Halfling") → «для» ("или 30 тыс. для Halfling");
  "for [a specific named inducement/rule]" (e.g. "or 60k for Bribery and
  Corruption") → «при» ("или 60 тыс. при Bribery and Corruption"). Both
  renderings were already established in `Rules/3. Team Management.md`'s
  duplicate of this same Inducements content; kept distinct because «при»
  reads more naturally for "under/with [rule]" than «для» does.
- **Assistant Coaches / Cheerleaders inline count** — Inducement blurbs that
  say "+1 assistant coach"/"+1 cheerleader" (English singular, lowercase) are
  rendered as "+1 Assistant Coaches"/"+1 Cheerleaders" (English plural,
  capitalized, matching the UI-label spelling) rather than translated as a
  generic Russian noun, since these names must stay English absolutely
  everywhere per the UI-label ruling above. Matches the existing rendering in
  `Rules/3. Team Management.md`.
- **"Team-mate"** (the generic noun for a fellow roster player, not a
  proper name) → «напарник», consistent with existing translated
  `Rules`/`General Information` content (e.g. the Blood Lust/Bloodlust
  rules text). Decline normally (напарника/напарнику/напарником/etc.).
- **Named game-state and result identifiers** that recur across
  `Skills and Traits/Traits` (Task 12) — `Distracted`, `Rooted`,
  `Journeyman`, `Marked`, `Player Down`, `Follow-up`, `Pushed Back` — stay
  in English, the same capitalized rule-identifier treatment already
  established for `Prone`/`Knocked Down`/`Sent-off`/`Open`. Where a state
  is entered, phrase it as «переходит в состояние X» (already used for
  `Placed Prone` in `Rules/3. Team Management.md`), rather than inventing a
  new construction per file.
- **"Rush" and "Intercept"** (core rule actions with no dedicated skill
  page, referenced generically in prose) stay in English, grouped with the
  already-established named-action family (Move, Blitz, Pass, Hand-off,
  Foul, Block).
- **"Armour roll" / "Injury roll" / "Casualty roll"** (generic dice-roll
  procedure names, not proper nouns) → «бросок на броню» / «бросок на
  травму» / «бросок на травму» respectively — consistent with existing
  `Rules` content (`Fireball`, `Bounce` entries, etc.). A named table like
  "Stunty Injury Table" renders as «таблица травм Stunty» (generic word
  translated, trait name kept English), the same pattern already used for
  "Star Player table" → «таблицу Star Player».
- **"Throw-in template" / "scatter" (ball or player deviation)** →
  «шаблон броска мяча в аут (throw-in template)» / «разлёт (scatter)»,
  reusing the established gloss pattern from `Rules/3. Team Management.md`
  ("мяч разлетается (scatter)") and `All Gata Changes.md` ("Броски мяча в
  аут (Throw-Ins)").

If `content/Gata`'s English source itself contains unrecoverable corruption
(e.g. a block of text with characters destroyed at the byte level, not just
untranslated), don't fabricate replacement text. Mirror the source's broken
text byte-for-byte into the RU file and flag it for follow-up outside the
translation task's scope — that's a pre-existing data-integrity problem, not
a translation gap.

- **Star player special-ability names** (Task 13): the short title before the
  colon in a `**Special Ability:**` line (e.g. `Precision Pass`, `Star of the
  Show`) stays in English, same treatment as skill/inducement names — only
  the descriptive sentence after the colon is translated. Confirmed against
  the task's own worked example (`Asperon Thorn.md`).
- **Named actions + "Action"/"Special Action"** (Task 13): when a named
  action (`Block`, `Blitz`, `Pass`, `Foul`, `Move`, `Hand-off`) is paired with
  the word "Action" or "Special Action" (e.g. `Block Action`, `Pass Action`,
  `Stab Special Action`, `Chainsaw Attack Special action`), keep the whole
  phrase in English exactly as capitalized in the source, rather than
  translating "action" to «действие». This differs from earlier Rules-content
  translations (Task 8), which used «действие Block»-style phrasing; the
  Star Players task's own worked example established the whole-phrase-English
  convention instead, so it's used consistently here. Generic, non-named uses
  of "action" (e.g. "before making the first action") are still translated
  normally as «действие».
- **"Knocked Down" / "Sent Off" (or "Sent-off")** (Task 13): kept in English
  as player-state/game-event terms, same treatment as `Prone`/`Stunned`.
  `Sent Off`/`Sent-off` is glossed on first use per file as «удаляется с поля
  (Sent Off)» / «удалён с поля (Sent-off)» (spelling/hyphenation matches the
  source), consistent with existing Kick-off Table and Prayers to Nuffle
  renderings.
- **"Armour roll" / "Injury roll"** (Task 13) → «бросок на броню» / «бросок
  на травму», matching the established Rules translation (no English gloss
  needed, these aren't glossary-listed retained terms). **"Casualty roll"**
  (a third, distinct roll type alongside those two, e.g. in Puggy
  Baconbreath's and Ripper Bolgrot's special abilities) → «бросок по таблице
  травм», to keep it distinguishable from "Injury roll" in the same sentence.
- **"Distracted"** (a player status effect introduced in Kiroth Krakeneye's
  special ability, with no prior translation elsewhere in the site) stays in
  English, treated the same as `Prone`/`Stunned`/`Open` — an established
  player-state term rather than ordinary prose.
- **Source typos and misspelled cross-references in star player prose**
  (Task 13) are preserved verbatim rather than silently corrected — e.g.
  Lucian Swift's ability text repeatedly calls him "Lucien" (vs. "Lucian" in
  the `**Name:**` field), and Grak's ability refers to "Grumbleberry" (vs.
  "Crumbleberry", the correct star player name/filename). These are treated
  like the broken-export-artifact rule: don't fabricate a correction the
  source doesn't contain.
- **Lowercase "tackle zone" / "control zone"** (the generic descriptive
  phrase, as opposed to the capitalized proper-noun "Tackle Zone" which
  already stays fully English per the named-actions rule above) → translated
  as «зона контроля», glossed with the English original in parentheses on
  first mention per file/section: «зоне контроля (tackle zone)». This
  follows the precedent already set in `General Information/All Gata
  Changes.md` ("...в зоне контроля (tackle zone) владельца навыка").
- **Capitalization-as-signal for Blood Bowl rule-identifiers** (Task 11,
  Skills translation): the English source is inconsistent about whether it
  capitalizes a term to invoke it as a defined rules keyword (e.g. "Both
  Down", "Knocked Down", "Push Back", "Prone", "Standing", "Marked",
  "Sent-off", "Distracted", "Fall Over", "Follow-up", "Rush") versus using it
  as ordinary lowercase language. Established rule: if the source
  capitalizes the term at that point in the sentence, keep it bare English in
  the translation (same treatment as named actions/skills); if lowercase,
  translate it as ordinary prose. Where a Russian verb is needed to carry a
  capitalized English result/state term grammatically (e.g. "this player
  Knocks Down an opponent"), use a neutral carrier verb — «наносит»/«получает»
  — and keep the term itself bare English immediately after it (e.g. "наносит
  сопернику Knocked Down").
- **"Touchback"** (generic rules vocabulary, not previously covered) →
  transliterated the same way as Drive/Turnover/Touchdown/Kick-off: "тачбэк"
  (lowercase, ordinary Russian noun).
- **Root landing page `content/Gata/Gata Blood Bowl League.md`** (missed by
  Tasks 8-14's file lists, translated during the Task 15 merge/QA pass):
  "homebrew" → «доморощенные правила», matching the existing rendering in
  `Rules/1. League Basics.md`. "Sevens" stays English (established game-format
  term, used untranslated throughout `content/Gata-ru`).

## Keeping the RU vault in sync with `content/Gata` over time

This project reached "fully translated" once, on 2026-07-15. Content is not static — the league's
English source gets edited, cleaned up, or expanded independently of translation work (this
happened almost immediately: a separate branch merged in with 226 changed EN files, 7 deleted, and
2 new special-rules sections, none of it translated). Treat every merge or pull that touches
`content/Gata/` as a translation task, not just a code review. Concretely:

1. **Find the drift.** Two commands, run from repo root:
   ```bash
   # Structural: any RU file with no EN counterpart, or vice versa
   diff <(cd content/Gata && find . -type f | sort) <(cd content/Gata-ru && find . -type f | sort)

   # Content: what changed in EN since the RU translation was last synced
   # (replace <base> with the commit/branch the RU vault was last verified against)
   git diff <base> HEAD -- content/Gata/
   ```
2. **Deleted EN file →** `git rm` the matching RU file. Don't leave an orphan; it breaks the
   file-parity invariant `scripts/build-data.mjs` relies on and `npm run i18n:check` enforces.
3. **New EN file →** translate it into a same-named RU file, following the categories and structural
   bold-label rules earlier in this document.
4. **Modified EN file →** read the diff. Distinguish:
   - **Pure formatting** (link syntax, whitespace, a reworded-but-same-meaning sentence) — apply the
     equivalent formatting change to RU, translating any new descriptive text.
   - **Real rule/data changes** (an `Availability`/`League`/`Special Rules` value changed, a skill's
     actual mechanical text changed, a previously-garbled English paragraph got fixed) — retranslate
     that specific field/paragraph. Don't assume the old RU translation is still correct just because
     the file diff looks small; a one-line change can flip a rule's meaning (e.g. "increases the
     player's value" → "does not increase the player's value" is a 3-word diff with the opposite
     rule effect).
   - If EN text that was previously garbled/corrupted is now fixed, this is your chance to produce a
     real translation instead of the byte-for-byte mirror the corruption-handling rule called for —
     don't leave the RU side mirroring garbage once a good source exists.
5. **Rebuild and verify:**
   ```bash
   npm run build && npm run i18n:check
   ```
   Expect matching page counts in both locales and `0 falling back to Gata` in the build output.
6. **New UI code** (not content) needs the same treatment — see `CLAUDE.md` at the repo root for the
   `t()`/`data-i18n` convention. If a branch with new views/panels merges in without i18n support
   (this has already happened once with a Season/Administration/roster-catalog feature set), grep the
   new code for hardcoded string literals in template strings before considering the merge done —
   `npm run i18n:check` only validates *content* parity, it has no way to catch a hardcoded English
   string sitting in `src/app.js`.
7. **Content embedded directly in JS, not the Markdown vault** (e.g. `overviewCards` in
   `src/app.js`, a ~380-line array of Code of Conduct / season-structure rules prose backing the
   `/overview/*` routes): this doesn't get picked up by the `content/Gata` ⇄ `content/Gata-ru` diff
   in step 1 at all, since it never touches `content/`. Grep `src/app.js` itself for large data
   arrays of English prose when auditing a merge for translation gaps. The established pattern
   (see `overviewCardsRu` next to `overviewCards`) is a parallel same-shape array selected by
   `state.locale` via a small `activeXxx()` helper, not a rearchitecture into the Markdown vault —
   keep new instances of this pattern consistent with it unless there's a reason to migrate the
   whole thing into `content/Gata` properly.

## New-UI translation sweep, 2026-07-15 (origin/main merge)

The `origin/main` merge folded in a large, independently-developed feature set (Season,
Administration, team/star-player catalog cards, favoured-skills editor, public player/team
profiles — roughly 90 new functions, ~2000 lines) that had zero i18n. All of it was swept and
wrapped in `t()`/`data-i18n` in the same pass as the merge (129 new keys added to
`src/i18n/en.json`/`ru.json`), plus a parallel `overviewCardsRu` array for the new Overview
content pages. Established conventions from this sweep, for consistency if this area is extended
further:

- **"Coach"** (a site user who manages a team, distinct from in-fiction "coach" flavor text) →
  «тренер».
- **"BYE"** (a tournament pairing with no opponent) stays English/all-caps as a status word, same
  treatment as other short match-result indicators; the table column *counting* byes ("Byes")
  translates as «Баи» (transliterated tournament jargon, not a literal translation).
- **"TD"** (touchdown abbreviation in season/fixture tables) stays English, joining the
  MA/ST/AG/PA/AR/SPP/TV/GP/CAS core-stat-shorthand family — the spelled-out word "Touchdowns"
  still transliterates to «тачдауны» per the existing Drive/Turnover/Touchdown convention.
- **"Tier"** (the catalog card's stat label for a team's league value) → «Лига», matching the
  established `**League:**` → `**Лига:**` structural-label convention elsewhere, even though this
  particular UI label's underlying data field is named `.league` and it says "Tier" in the source.
- **Round/Table/Home/Away/Opponent** (Swiss-pairing season vocabulary) are ordinary translated UI
  words («раунд», «стол», «хозяева», «гости», «соперник») — not treated as kept-English rule
  identifiers, since they're season-administration bookkeeping terms, not Blood Bowl rules text.
- **Advancement types in the 3.0 UI** (stage 07d, 2026-10-20) — a UI-only exception to "Advancement
  rank and type names" at the top: the RU UI names the four types the way the handoff prototypes
  do (`Adv1Type`, `DeskRosterAdv`), not with the English terms. The full names
  (`teamAdvance.type.*`: phone sheet, profile, undo sheet) are «Случайный основной навык»,
  «Основной навык на выбор», «Вторичный навык на выбор», «Улучшение характеристики»; the desk's
  short ones (`teamAdvance.typeShort.*`: desk window, its summary and «done» line, the desk panel's
  skill source) are «Случайный основной», «Основной на выбор», «Вторичный на выбор»,
  «Характеристика». Content keeps the English Random/Primary/Secondary terms (`content/Gata-ru`,
  including the Player Advancement table headers), so don't "fix" either side to match the other.
  Skill names and skill categories (Agility, General, Strength…) stay English in the sheet, as
  everywhere.

## 3.0 UI terms (stage 13)

These are the words the 3.0 screens use for their own things, in both languages. Each stage of the redesign
(05–13) handed its words over to stage 13. The dictionaries (`src/i18n/en.json`, `src/i18n/ru.json`) are
the source. Each row gives the dictionaries' words. Where a stage's hand-off named a term differently, the
dictionary's words stand, and a note under the table says so ("as built"). The rules above still hold
inside these words: skill, position, team and inducement names stay English, and so do TD, CAS, SPP and
Coach's Safe. When a dictionary word changes, change its row. A new screen's own words get a row too.

"Where" gives the stage that brought the word and the key that holds it.

| English | Russian | Where |
|---|---|---|
| Reference | Справочник | 05 · `shell.tab.ref` (the tab and the SideNav item) |
| Appearance | Оформление | 05 · `settings.appearance` |
| Palette | Палитра | 05 · `settings.palette` |
| Settings | Настройки | 05 · `shell.tab.settings`, `settings.title` |
| Draft (a team's stage) | Набор | 06 · `teams.stage.draft`; see «набор» (12) and note 9 |
| My teams | Мои команды | 06 · `teams.title` |
| Team leaders | Лидеры команды | 06 · `teamOverview.leaders` |
| Recent matches | Последние матчи | 06 · `teamOverview.results` |
| Active roster | Активный состав | 07a · `teamRoster.heading` |
| Match records | Записи матча | 07a, 09a · `shell.match.records`, `teamRoster.records`, `matches.records` |
| Edit outside the match | Правка вне матча | 07a · `teamRoster.match.outside` |
| manual edit | ручная правка | 07a · `teamRoster.sppLine`, `teamPlayer.edit.spp`; note 1 |
| TTM | TTM | 07a · `teamRoster.counter.throws`; TD, KO, CAS, INT, MVP and COMP stay English too |
| Landing | Призем. | 07a · `teamRoster.counter.landings` (the full word: «приземление», `teamRoster.counterName.landings`) |
| Bonus | Бонус | 07a · `teamRoster.counter.bonus` |
| Missing the match | Пропускают матч | 07b · `teamRoster.skips.heading`; "Miss the match" in `matches.before.missing`; note 2 |
| Fallen | Погибшие | 07b · `teamRoster.fallen.heading` |
| Mark the death | Отметить гибель | 07b · `teamRoster.mark.sendDead` |
| Undo the mark | Отменить отметку | 07b · `teamRoster.fallen.undo` |
| Temporarily retired for the season | Временный уход до конца сезона | 07b · `teamRoster.skips.retired`; note 2 |
| Hire players | Нанять игроков | 07c · `teamRoster.hire.title`, `teamRoster.hire.open` |
| Cart | Корзина | 07c · `teamRoster.hire.cart` |
| Cancel the purchase | Отменить покупку | 07c · `teamRoster.sell.cancelTitle` (its button: "Cancel purchase", `teamRoster.sell.cancelOpen`) |
| Sell the player | Продать игрока | 07c · `teamRoster.sell.title` (the post-match says "Sell a player", `after.sellTitle`) |
| Advancement | Прокачка | 07d · `teamAdvance.title`, `teamPlayer.advance` |
| Random primary skill | Случайный основной навык | 07d · `teamAdvance.type.random` (the other types: the last item of "New-UI translation sweep" above) |
| Rolled at the table | Бросил за столом | 07d · `teamAdvance.via.table` |
| Skill in place of a characteristic | Навык вместо характеристики | 07d · `teamAdvance.insteadTitle`; note 3 |
| Bonus skill | Бонусный навык | 07d · `teamPlayer.favoured.label` |
| Two D16s · Roll two D16 | Два D16 · Бросить два D16 | 07d · `teamAdvance.rollResult`, `teamAdvance.rollD16`; note 3 |
| The skills rolled | Выпавшие навыки | 07d · `teamAdvance.pairLabel`; note 3 |
| Career · by match | Карьера · по матчам | 07e · `teamPlayer.career.title`, `teamPlayer.career.byMatch`; note 4 |
| Before the site's records | До записей на сайте | 07e · `teamPlayer.career.before` |
| waits for the post-match | ждёт итогов | 07e · `teamPlayer.career.pending` |
| Edits outside a match | Правки вне матча | 07e · `teamPlayer.career.outside` |
| Treasury and resources | Казна и ресурсы | 08 · `treasury.title` |
| Add · Take | Зачислить · Списать | 08 · `treasury.money.signIn`, `treasury.money.signOut`; note 5 |
| Building the team | Набор команды | 08 · `treasury.phase.draft`; note 5 |
| Correct by hand · Fix by hand | Исправить вручную | 08 · `treasury.fix.title` (the treasury); 07d · `teamPlayer.fix.title` (a player); note 1 |
| Coach's Safe | Coach's Safe | 08, 09b · `treasury.safeTitle`, `after.safe`; the plain word "safe" is «сейф» (`after.toSafe`) |
| Bribes | Bribes · Взятки | 08 · `treasury.strip.bribes` (English in both); 06, 12 · `savedRoster.bribes`, `adminTeam.staff.bribes`; note 5 |
| Before the match | Перед матчем | 09a · `prep.title`, `matches.before.title`, `guestHome.tile.match` |
| Inducements | Индьюсменты | 09a · `pre.step.inducements`, `matches.inducements`, `prep.ind.title`; note 6 |
| Journeymen | Journeymen | 09a · `prep.roster.journeymen`; note 6 |
| Post-match | Итоги матча | 09b · `shell.match.postMatch` |
| From the match records | Из записей матча | 09b · `after.records` |
| Stood out | Отличились | 09b · `after.mvpTop` |
| Veterans after conceding | Ветераны после сдачи | 09b · `after.departures` ("… · D6"); note 7 |
| The god's D8 | D8 бога | 09b · `teamPlayer.favoured.d8Label`; note 7 |
| Season calendar | Календарь сезона | 10 · `league.calendar` |
| entry withdrawn | заявка отозвана | 10 · `league.withdrawn` |
| Next opponent | Следующий соперник | 10 · `opponent.next` |
| Our meeting | Наша встреча | 10 · `opponent.meeting` |
| Your meetings | Ваши встречи | 10 · `coach.meetings` |
| Before and during a match | Перед матчем и в игре | 11 · `ref.group.match` (the reference's groups, in their order) |
| Players | Игроки | 11 · `ref.group.players` |
| Teams | Команды | 11 · `ref.group.teams` |
| League | Лига | 11 · `ref.group.league` |
| League Rules | Правила лиги | 11 · `section.rulesTitle` |
| In brief · Full text | Кратко · Полный текст | 11 · `ref.rules.brief`, `ref.rules.full`; note 8 |
| Playing in the league | В лиге играют | 11 · `ref.team.inLeague`; note 8 |
| In your team | В нашей команде | 11 · `ref.skill.ours`; note 8 |
| Coach with a team | Тренер с командой | 12 · `administration.coachNew.title` |
| Temporary password | Временный пароль | 12 · `administration.password` |
| Move into the season | Перевести в сезон | 12 · `adminSeason.activate` |
| build · in the build | набор · в наборе | 12 · `adminSeason.entryDraft`, `administration.team.draft`, `administration.inDraft`; note 9 |
| Playoff zone: places 1–{places} | Зона плей-офф: места 1–{places} | 12 · `league.zone` (`league.zoneOne`, `league.zoneRanks`); the season's setting is "Playoff places" / «Мест в плей-офф» (`adminSeason.playoffPlaces`) |
| Technical win | Техническая победа | 12 · `league.technical.other`, `after.technicalIncome` |
| The opponent could not field a team | Соперник не смог выставить команду | 12 · `adminSeason.reason.no_team`, `after.reason.no_team`; in lower case inside a line (`league.technical.no_team`) |
| A fallen player, afterwards | Погибший задним числом | 12 · `adminTeam.fallen.sheetTitle`; its section is "Fallen, added afterwards" / «Погибшие задним числом» (`adminTeam.fallen.title`) |
| Friendlies | Товарищеские | 09c · `friendly.title`; note 10 |
| Challenge | Бросить вызов | 09c · `friendly.send`; 10 · `coach.challengeDesk` |
| Challenge sent | Вызов отправлен | 09c · `friendly.busy` |
| Recent opponents | Недавние соперники | 09c · `friendly.recent` |
| Challenge history · {count} | История вызовов · {count} | 09c · `friendly.history` |
| Match | Матч | 13 · `gamePage.title`; note 11 |
| Confirm the score · Reject | Подтвердить счёт · Отклонить | 13 · `gamePage.confirm`, `gamePage.reject` |

**As built — where a hand-off and the dictionaries differ:**

1. **«Ручная правка».** Stage 07a handed it over as "Fix by hand". In the dictionaries, «ручная правка» is
   "manual edit": the SPP line that a hand edit leaves. "Fix by hand" is the player's sheet, «Исправить
   вручную». The treasury's sheet says "Correct by hand" in English and «Исправить вручную» in Russian. The
   line it leaves in the history says «ручная правка» again (`treasury.kind.manual`, "Treasury corrected
   by hand" / «Ручная правка казны»).
2. **07b.** "Miss the next match" is "Missing the match" on the roster and "Miss the match" in the
   before-the-match sheet; both are «Пропускают матч». "Temporary retirement until the end of the season"
   is "Temporarily retired for the season".
3. **07d.**
   - "Skill instead of a characteristic" is "Skill in place of a characteristic · {cost} SPP".
   - "Two D16" is "Two D16s on the category's table", and its button is "Roll two D16".
   - "Skills rolled" is "The skills rolled".
4. **07e.** «Карьера по матчам» is two words on the screen: the section's title «Карьера», and «по
   матчам» beside it.
5. **08.**
   - "Credit / Debit" are "Add" / "Take", and "Team draft" is "Building the team".
   - **Bribes is written two ways.** The treasury's strip writes "Bribes" in both languages, like the
     strip's other short English labels (as the prototype does, stage 08). The builder (06) and the
     admin's staff (12) say «Взятки».
   - The content's inducement is "Bribe" (`content/Gata/Inducements/Bribe.md`). The rule "Inducement
     names used as UI labels elsewhere" above keeps that name English. Stage 13 does not settle this:
     the words stay as built.
6. **09a.**
   - **Inducements.** The match screens say «Индьюсменты» in Russian: the step, the tile, the card and
     the category switch. This is a deliberate UI exception to "Inducements" staying English, like the
     advancement types. The reference's section (`nav.inducements`) and every inducement's own name stay
     English.
   - **Journeymen** stay English in the preparation. The server's refusal `error.MATCH_JOURNEYMEN` still
     says «Джорнимены» and «лайнмена».
7. **09b.** "Veterans after a concession" is "Veterans after conceding · D6". "D8 of the god" is "The
   god's D8".
8. **11.**
   - "Short" is "In brief", and "Played in the league" is "Playing in the league".
   - "In our team" is "In your team" in English but «В нашей команде» in Russian: here the two
     dictionaries differ in person.
9. **«набор» (12).** The administration says "build" / "in the build". The team's stage chip says
   "Draft" (06). Russian says «набор» in both places. A round that has not started is something else:
   "draft" / «черновик» (`adminSeason.roundDraft`).
10. **09c.** Its five rows were read from `rd/09c-challenges` (70d729e) before it was merged. Check them
    against the dictionaries once it is in.
11. **13.** The `gamePage.*` keys come with stage 13's match page (`#/games/:id`).

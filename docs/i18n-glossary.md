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
  Star, Star, Superstar, Legend, and Random/Primary/Secondary/Stat.

## Structural bold-label markers

`scripts/build-data.mjs` parses a few fixed bold-label lines out of team and
star player pages to populate structured fields (roster meta, builder costs).
When translating those specific lines, use these exact Russian phrasings —
anything else won't be recognized by the parser:

| English            | Russian (use exactly this) | Used on         |
|---------------------|------------------------------|-----------------|
| **Rerolls:**         | **Перебросы:**                | Team pages      |
| **Apothecary:**       | **Апотекарий:**               | Team pages      |
| **League:**           | **Лига:**                     | Team pages      |
| **Special Rules:**    | **Специальные правила:**      | Team pages      |
| **Availability:**     | **Доступность:**              | Star player pages |
| **Cost:**             | **Цена:**                     | Star player pages |
| **Teams:**            | **Команды:**                  | Star player pages |

`**Name:**` and `**Special Ability:**` on star player pages are *not* parsed
into structured fields (pure display prose) — translate them freely, e.g.
`**Имя:**` / `**Персональная способность:**`.

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

- **Reroll(s) / Apothecary, used generically in prose** (not as a bold
  structural label, not as part of a named inducement) → "переброс(ы)" /
  "апотекарий", consistent with the structural-label translations above.
  Named inducements built on these words (`Wandering Apothecary`, `Mortuary
  Assistant`, `Plague Doctor`) stay fully English as inducement names.
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

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

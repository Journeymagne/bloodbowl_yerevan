# Gata Blood Bowl League — contributor notes

This site is fully localized (EN/RU). Two things depend on that staying true after every change:

## 1. Content: `content/Gata/` and `content/Gata-ru/` must mirror each other

`content/Gata/` is the English source vault; `content/Gata-ru/` is the Russian translation. The build
(`scripts/build-data.mjs`) derives page identifiers from filenames, so the two vaults must have
**identical file and folder names** at all times — same files present, same files absent.

**Whenever `content/Gata/` changes** (new page, deleted page, or edited page text), do the matching
work in `content/Gata-ru/` before merging:

- New EN file → create a translated RU file with the same relative path.
- Deleted EN file → delete the matching RU file (don't leave orphaned translations).
- Edited EN file → check whether the edit is a real content/rule change (not just formatting) and
  update the RU translation to match. A stale RU translation that contradicts the current EN rules
  text is worse than an English fallback.

Full translation conventions (what stays in English, structural bold-label requirements the build
parser depends on, established terminology) live in `docs/i18n-glossary.md` — read it before
translating anything. It has a "Keeping the RU vault in sync" section with the exact commands to
find drift.

**Before committing a content change, run:**
```bash
npm run build && npm run i18n:check
```
This must report the same page count for both locales with 0 fallbacks.

## 2. UI strings: everything in `src/app.js`/`index.html` must go through `t()`

New UI (a new view, a new admin panel, a new form field, a new table column) must use the `t("key")`
helper and `data-i18n*` attributes, not hardcoded English strings — add the key + English value to
`src/i18n/en.json` and the Russian translation to `src/i18n/ru.json`. See existing calls in `src/app.js`
for the pattern. Skipping this is easy to miss because the app still runs fine in English; it just
silently breaks the Russian locale for that one feature.

If you're merging in work that was developed on a branch without the i18n layer (this has happened
before — see `docs/i18n-glossary.md`'s sync section), grep the new/changed code for hardcoded
`>[A-Z]` string literals in template strings before merging, not after.

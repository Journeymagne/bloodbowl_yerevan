# SkillChip

A skill or trait name a player has. Tap opens the skill's rule in a BottomSheet.

**Provide:** name exactly as in the rules, whether it was gained by advancement, the handler.

- **Inline** (`g-skill`, roster characteristics): min-height 32, `radius-sm`, 13px. Starting skills `surface-2`/`ink-2`; gained `accent-tint`/`on-accent-tint` 700. `aria-haspopup="dialog"`.
- **Card** (`g-skill--card`, player profile): 15/600 name with an 11px source line («стартовый», «Основной на выбор»); outline 1px `control-border`, gained on `accent-tint`.

Wrap with gap 6 (inline) or 8 (card). No skills → the word «без навыков» in `faint`, not a chip.

**The skill sheet:** category badge 44 + name `team-name` + category caption, close button; rule text 17/1.45; a `surface-2` line naming the player and the source.

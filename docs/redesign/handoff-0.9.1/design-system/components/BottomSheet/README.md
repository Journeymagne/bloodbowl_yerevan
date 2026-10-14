# BottomSheet

Every choice, multi-step flow and detail view opens here: advancement, missed-match reason, skill rule.

**Provide:** title, one-line sub (context: player, cost), step count and current step for flows, body content, one footer CTA, back/close handlers.

**Anatomy:** `scrim` over the whole screen (`position:absolute; inset:0; z-index:20`), sheet `surface` with `radius-sheet` top corners, max-height 86%. Handle 40×5 `control-border`. Header grid 44 · 1fr · 44: back icon button (only when there is a previous step, and not after a roll), centred `section-s` title + 13px `muted` sub, close icon button. Step dots: 8×6 `line-strong`, done `accent`, current 24 wide. Body scrolls, padding 12 16 8, gap 8. Footer padding 10 16 24 over a `line` rule with one primary Button.

**Flows** keep their state inside one sheet and end on a done step: check circle 64 in `accent`, `team-name` result, three summary tiles (SPP spent, value change, count), CTA back to the screen.

**Don't** stack sheets, use browser dialogs or put two primary buttons in the footer.

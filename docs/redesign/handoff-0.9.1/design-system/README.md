The interface of the Gata League Blood Bowl Sevens site: team roster, SPP tracking during a match, player advancement, fixtures, league table and the rules reference. Mobile first (390 × 844), light, calm: a dark pitch-green header over white tables. Build every new screen from the tokens and components below; the class names in `components/bundle.css` are the reference implementation of each part.

## Content

- **Language.** Interface copy is Russian. Blood Bowl terms of art stay in English exactly as the rulebook writes them: SPP, TD, CAS, COMP, KO, INT, MVP, TTM, MA ST AG PA AV, skill and trait names (Block, Mighty Blow), Niggling Injury, Inducements, Star Players, position names (Blitzer, Catcher). Never translate a skill name.
- **Voice.** Short, plain, coach-to-coach. Buttons name the action: «Прокачка», «Взять Diving Catch», «Отметить пропуск», «Подготовка к матчу». Helpers explain the rule in one line: «Не хватает 6 SPP», «Бросок 1D16 по таблице категории».
- **Numbers.** Stat values with their suffix: `3+` for AG/PA/AV, plain for MA/ST. Money in thousands with `k`: `85k`, `1 120k` (thin-space thousands). Scores with an en dash: `2–1`. Signed diffs: `+6`, `−4` (true minus).
- **Results.** One letter: В / Н / П (win, draw, loss).
- **No filler.** Unknown data is a bracketed placeholder in caps: `[ДАТА И ВРЕМЯ]`, `[НАЗВАНИЕ ЛИГИ]`. No emoji anywhere.

## Colour

- Page and sheets on `surface`; recessed panels (expanded row, tiles, search) on `surface-2`; tracks and icon buttons on `surface-3`.
- Text in `ink`; second lines and helpers in `muted`; de-emphasised zeros in `faint` (only for zeros and disabled items: it is 3.2:1).
- `pitch-900` is the brand: the app header and dark buttons. Header text uses `header-ink`, `header-muted`, `header-tab`.
- `accent` is the only action and "good" colour: primary buttons, SPP totals, the active sort column, selected rings, positive diffs. Its tints mark earned things: `accent-tint` behind gained skills, improved stats, your own team row; `accent-tint-soft` behind a selected option.
- `danger` marks losses, injuries, missed matches and unaffordable options, always with words. Draws use `neutral-result`.
- Position badges take `pos-*`; skill categories take `cat-*`. These carry white text and never appear as large fills.
- `crest-gold` is the crest only.

## Type

- Two Google families with full Cyrillic: **Oswald** (`--font-display`) for names, headings and big numbers; **Golos Text** (`--font-body`) for everything else. Russian and English text must share one face, so never fall back to a Latin-only family. Never Inter, Roboto or a third face.
- Use the styles in `tokens.json`: `team-name` 22 in the header (18 when compacted), `section` 26 for a screen's H2, `section-s` 24 in sheets and sub-sections, `page-title` 32 for content pages, `stat-xl` 44 for the one hero number, `row-title` 16/500 for names in rows, `body` 15, `caption` 13 in `muted`, `col-label` 12/600 uppercase for column heads.
- Tables and anything with digits in columns set `font-variant-numeric: tabular-nums`.

## Layout

- Screen = AppHeader + one scrolling `main`. Side gutter `space-16`, always. Sections separated by `space-20` (table screens) or `space-22` (content screens).
- Tables run edge to edge with `space-16` inner padding; their header row is sticky and sits below the screen's H2. Name column `minmax(0,1fr)`, numeric columns fixed (30–50px), total column right-aligned.
- Every control is at least `size-touch` (44px). Rows at least `size-row` (60px). Primary actions are full-width `size-cta` (52px) buttons at the bottom of a card or sheet.
- Children of a scrolling flex column that have a fixed height (search field, tiles) get `flex: none`, otherwise the column squeezes them.

## Surfaces, borders, depth

- Separate rows with 1px `line`; tables' header with `line-strong`.
- Cards and options are outlined with the inset `ring` shadow, not a border, so the 2px `ring-selected` does not move the layout. Fill + ring marks a selected item.
- The only drop shadow is `shadow-thumb` on a selected segment. Sheets sit on `scrim`. No gradients (one exception: the PreMatchSheet hero), no coloured left borders.
- Radii: `radius-md` 10 for small buttons and chips, `radius-lg` 12 for the CTA, inputs and tiles, `radius-xl`/`radius-2xl` for cards, `radius-sheet` 22 for sheet tops and round icon buttons, `radius-full` for number badges and filter chips.

## Interaction patterns

- **Tap a row to expand it in place** (RosterTable): quick +/− steppers and secondary actions live in the panel, never in the row.
- **Tap a column header to sort**; the active header turns `accent` with ▲/▼. Numbers sort descending first; AG/PA (lower is better) ascending.
- **Multi-step choices run in one BottomSheet** with step dots, back and close in the header and a single CTA in the footer whose label says what will happen («Далее», «Бросить D8», «Взять Diving Catch»). Disabled options stay visible with the reason.
- **Dice rolls** show the die type and the result in a Die, the full table under it, the hit row highlighted; owned results are struck through and rerolled.
- **Tap a skill chip** to open its rule in a sheet (category badge, name, one-paragraph rule, whose skill and where it came from).
- Keyboard focus: `focus-ring` on every control.

## Iconography

- Inline stroke SVG only, `currentColor`, round caps, stroke 2.2–2.6 at 14–20px: chevrons, plus, minus, close, search, arrow-up (advance), play (start match), check (done). No icon font, no emoji.
- The crest is an inline SVG shield in `crest-gold` and `pitch-900` with a ball; there is no other logo. Ellipsis or back buttons do not appear in the site header.

## Building a new screen on the Design canvas

1. Artboard 390 × 844, `is_interactive: true`, `radius: 28`. Root: `display:flex; flex-direction:column; overflow:hidden; position:relative` with `--font-body`, `ink`, `surface`.
2. Copy the AppHeader markup, set the tab that owns the screen as `aria-current="page"`. Tabs: Команда · Состав · Матчи · Таблица · Справочник · Тренер · Настройки (the row scrolls; on the last three screens it opens scrolled to the end).
3. `main`: `flex:1 1 auto; overflow-y:auto; position:relative; z-index:0`. Build from components, inline-styled with the token values (the canvas edits inline styles).
4. Overlays (sheets) go last in the root with `position:absolute; inset:0; z-index:20`.

## v2 additions (prototype v0.6)

### Desktop
- 1440 artboard, `expand: fill`. Root is a wrapping flex row: SideNav (`size-sidebar`) + content column (`flex: 999 1 640px`) on `surface-2`, white cards with the `ring`, `radius-2xl`, gaps 20.
- Sections: Обзор · Состав · Сезон · Справочник · Тренер. Desktop is not a stretched phone: tables get more columns, the player opens in a right panel, advancement runs in a three-column modal.
- Dialogs are centred 460–640px cards on the scrim, 110–120px from the top.

### Matches
- A match has one lifecycle (StatusChip): Не начат → Подготовка → Идёт игра → Итоги → Завершён (superseded in v0.9: see «Step flows»).
- The MatchCard, MatchBoard and SideNav card hold one entry: «Подготовка к матчу»; during the game «Записи матча» and «Итоги матча». The roster is the in-game screen for counters; it never holds start/finish controls.
- Swiss system: only the current round has an opponent. Later rounds read «Соперник — после тура N» in `faint`, without venue.
- Inducements and missing players open the PreMatchSheet from InfoBubbles / tiles.

### Coach and settings
- Тренер: login (read-only), Telegram contact, «Ждут подтверждения» (PendingCard), all-time stats for the current team (KpiTiles, FormStrip, records list).
- Настройки (mobile tab; a right column on desktop Тренер): ThemePicker, language, Telegram notification Toggles, «Сменить пароль» (TextField flow) and «Выйти» in `danger` outline.

### Themes
- `tokens.json` has a `dark` value for every colour (this is the default dark palette, «Под прожекторами»).
- Coaches choose a whole **palette** per mode (see ThemePicker): light — Идеальная погода (default), Палящий зной, Метель, Имперская знать; dark — Под прожекторами (default), Тёмные эльфы, Пламя Хаоса, Проливной дождь. A palette recolours the header and SideNav too. The `accent-*` tokens are kept only as the accents of these palettes.

## v0.8 additions

### Header
- Mobile AppHeader is one row: crest + team name + chevron, the subtitle «Раса · место в лиге» under it. The subtitle never changes between tabs.
- On scroll (`main.scrollTop > 48`) the header compacts: crest 24px, name 18px, subtitle hidden; it expands back below 8px.

### Auth
- Вход and Регистрация are one screen with a SegmentedControl. Registration asks login (3+ chars), Telegram (`@username`, 5+ chars), password with a three-step strength meter and confirmation. Errors sit under the field in `danger` and on the field ring; a failed login keeps the login and clears nothing else.

### Team resources
- Treasury and resources are counters with −/+ (`size-touch`). Every counter knows the season phase: **Start Re-rolls** can be bought only before the season starts, **Team Re-rolls** only after it. A locked counter stays visible in `faint` with the reason.
- Money in or out of the treasury runs in a BottomSheet: amount stepper + quick chips (10/20/50/100k), a required reason, «after» preview; the CTA names the operation.

### Player actions
- In the expanded roster row (mobile) and the player panel (desktop) secondary actions are equal outline buttons in a two-column grid: «Пропуск матча…» and «Продать». They share the height of a secondary button (44 mobile, 40 desktop).
- Selling is always confirmed in a dialog: price breakdown (hire price, skills and improvements, value in TV, SPP that will be lost, refund), treasury before → after, and the only `danger` filled button «Продать за Nk». Breakdown rows are 44px, text vertically centred.

### Canvas
- The Design canvas has two pages, Мобайл and Десктоп, with the same flows in the same order; each flow is one row under a title. Since 0.9 a third page «Ревью» lists what changed.

## v0.9 additions

### Alignment
- In every «label — value» row the label and value are vertically centred. Short labels, pills and status chips never wrap (`white-space: nowrap`); pills are sized to content (`width: max-content; flex: none`) so they sit centred next to a name instead of stretching.
- A two-line label («Бюджет / Потрачено», «заработано / потрачено») sits on the left, the big number with its caption on the right, the row `align-items: center`.

### Counters
- Main SPP counters are ActionSteppers in two columns. Secondary events (TTM, landing, bonus) are a separate row of three narrow tiles: caption on top, «− value +» under it (32–34px buttons). Minus is disabled at zero.
- During a match each counter shows the career value with a green `+N` for what is recorded in the current match. A counter that can't be used in a match (MVP) keeps a grey disabled plus with a reason in the title.

### Match state banners
- Above the roster: amber Callout «Идёт подготовка…» (actions allowed, warns what resets), green Callout «Идёт матч · тур N · N записей» with a «Правка вне матча» Toggle; the toggle turns the banner amber.
- Locked actions during a match stay visible and disabled (hire «+», sell, advancement, treasury edit) with the reason «— после итогов матча».

### Step flows (pre-match, post-match)
- Mobile: dark header with back, title, «тур · команды», StepBar; scrollable body of cards; sticky footer with the opponent's status line (dot + text, centred) and one primary CTA.
- Desktop: three columns — step list with per-step status, the step in the centre card, a right column with status and CTA.
- Data that came from match records is marked: a card «Из записей матча» and a pill «из записи матча». A mismatch is a `danger` Callout that says where to fix it.

### Pickers
- Opponent picker: SearchField on top, «Недавние» first, then the full list of rows (avatar, login, teams, radio). Unavailable rows stay in the list with an amber pill («Уже вызван»). The CTA names the action and the choice («Вызвать thalion»). Desktop shows recent ones as chips and the list in two columns inside a scroll box.

### Player history
- «Карьера» is a disclosure: tap the heading to open a table of the season's matches (match, result, what the player did, SPP). A pending match row is tinted amber with a «ждёт итогов» pill.

### Fallen players
- A fallen player opens a read-only profile (grey badge and stats) with a status block, the cause and an outline «Отменить отметку» that asks for confirmation in a BottomSheet.

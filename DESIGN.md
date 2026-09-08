---
name: Gata Blood Bowl League
description: A club tournament journal with condensed sports typography, solid surfaces and copper actions.
colors:
  primary: "#99502c"
  primary-hover: "#7e3f22"
  primary-text: "#ffffff"
  copper: "#bc734a"
  copper-soft: "#e8af87"
  navy-bg: "#101d28"
  navy-panel: "#182b3a"
  navy-panel-raised: "#213847"
  navy-line: "#3f5664"
  navy-line-bright: "#9eafb9"
  navy-text: "#f0f4f5"
  navy-muted: "#b7c7d0"
  masthead: "#172d40"
  masthead-text: "#f3f5f4"
  masthead-muted: "#c0cdd5"
  nav-highlight: "#253f53"
  nav-underline: "#d49971"
  cool-bg: "#f0f3f3"
  cool-panel: "#ffffff"
  cool-panel-raised: "#e7edef"
  cool-line: "#c5d0d6"
  cool-text: "#172d40"
  cool-muted: "#526775"
  cool-soft: "#874726"
  focus: "#f3b27e"
  danger: "#ffb3aa"
  danger-bg: "#482e32"
  success: "#a5d4b8"
  success-bg: "#254439"
typography:
  display:
    fontFamily: "Oswald, sans-serif"
    fontSize: "clamp(3rem, 6vw, 5rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Oswald, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3.25rem)"
    fontWeight: 600
    lineHeight: 1.05
  title:
    fontFamily: "Oswald, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
  body:
    fontFamily: "Golos Text, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.55
  label:
    fontFamily: "Golos Text, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
rounded:
  standard: "4px"
  emblem: "3px"
  roster-pill: "999px"
spacing:
  control-gap: "8px"
  compact-gap: "12px"
  row: "16px"
  mobile-inset: "20px"
  section-gap: "24px"
  desk-inset: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.standard}"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-ghost:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.navy-text}"
    rounded: "{rounded.standard}"
    padding: "0 10px"
  input:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.navy-text}"
    rounded: "{rounded.standard}"
    padding: "0 10px"
  chip:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.navy-text}"
    rounded: "{rounded.standard}"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.navy-text}"
    rounded: "{rounded.standard}"
    padding: "16px"
---

# Design System: Gata Blood Bowl League

## Overview

**Creative North Star: "Club tournament journal"**

A practical competition programme for the Gata club: condensed sports headings, calm reading text, ruled information and restrained copper actions. Solid navy anchors the identity; cool light surfaces and the existing dark themes give players a comfortable workspace. The supplied Gata emblem remains the visual identifier.

Premium character comes from hierarchy, measured spacing and careful tables. Existing players should recognize a working league desk, with season, matches, teams and rules easy to scan in English or Russian. The selected world is recorded in the index body contract (candidate 5, seed 22546323); screenshot demo scores and names are test fixtures, never brand or season facts.

**Key Characteristics:**

- Condensed Oswald headings paired with Golos Text reading text.
- Solid surfaces, thin rules and small corners.
- Copper primary actions within a navy club frame.
- Dense information that reflows deliberately on phones.
- Equal visual care for English, Russian and all six themes.

## Colors

Copper gives actions warmth against a cool, structured ground. The frontmatter records the default navy palette and the principal cool light palette; `src/styles/tokens.css` is the complete runtime authority for theme overrides.

### Primary

Primary copper fills the principal action and deepens on hover, with white action text in every theme. Soft copper highlights text links in the default dark theme; the deeper cool-soft token performs that role on the cool light ground. These are distinct roles: do not substitute the decorative accent for the primary-button background.

### Secondary

Success and danger use their own text and background pairs for feedback. Their light-theme counterparts are separately defined in the source; never reuse the dark feedback pair on a light panel.

### Neutral

The navy background, panel and raised-panel steps separate page, container and tabular surfaces. Muted text remains readable; line and line-bright distinguish resting borders from hover emphasis. Masthead text and muted text have their own tokens because the masthead stays dark in light themes.

| Theme ID | Implemented character |
| --- | --- |
| `dark-gata` | Default navy root palette; copper links and actions. |
| `dark-dugout` | Green grounds, pale green soft text and green masthead; inherited copper primary actions. |
| `dark-warpstone` | Purple grounds, lavender soft text and purple masthead; inherited copper primary actions. |
| `light-parchment` | Cool gray page, white panels, navy text and copper links. The historical name does not imply a parchment texture. |
| `light-sideline` | Pale green page, white panels, green text accents and green masthead. |
| `light-altdorf` | Pale blue page, white panels, blue text accents and navy masthead. |

**The Semantic Surface Rule.** Build with the existing CSS aliases so a new surface follows every theme automatically.

The alias contract is explicit: `--bone` → text; controls, inputs, `--panel-glass`, `--surface-strong`, modal and ordinary button backgrounds → panel; `--surface-soft`, table heads and ordinary button hover → panel-2. Active filters use panel-2 with a soft-colored border. Sidebar uses masthead; topbar uses page background. Primary actions use the separate `--primary-*` family. `--overlay-bg` supplies the translucent scrim. Grid, stripe, glow and wash aliases are transparent; the body-gradient alias resolves to a solid background. Historical alias names do not authorize glass, gradients or texture.

## Typography

**Display Font:** Oswald, falling back to sans-serif. **Body Font:** Golos Text, falling back to ui-sans-serif, system-ui and sans-serif. Both are self-hosted in `assets/fonts/`; Oswald supplies weights 200–700 and Golos Text 400–900. Cyrillic support is part of the pairing, not an optional fallback.

The display role is the large season heading. General page headings use the smaller headline clamp. Tool and handbook headings use the title role; season names and reference-group headings use 26px/1.25 at weight 500. Body text follows the browser's 1rem base, with supporting descriptions and table cells at 14px. Form labels and table headers use 12px; navigation uses the label role. Buttons use weight 700.

Reference prose uses line-height 1.65 with a 75ch maximum on direct paragraphs and lists. The season introduction is limited to 38ch. Home standings use tabular numerals for points. Headings balance their lines, and long content may wrap anywhere when necessary.

**The Two Scripts Rule.** Preserve hierarchy and available width when copy switches between English and Russian; do not shrink Russian into a separate visual system.

## Layout

The frame is full-width with a centered content maximum of 1440px. The normal view inset is 24px 20px 48px; at widths up to 600px it becomes 20px 16px 36px. Most groups use gaps of 12, 16 or 24px; the wide home desk uses 32px. These are observed values, not a mandatory arithmetic scale.

| Threshold | Implemented change |
| --- | --- |
| Up to 380px | Topbar horizontal padding reduces to 14px; the mobile wordmark becomes 22px and account text has less width. |
| 601px | Page headings and forms can sit side by side; several reference and roster card views switch to tables. |
| 701px | Handbook and reference index use two columns. |
| 901px | Home desk becomes `minmax(0, 2fr) minmax(280px, 1fr)`; other detail and builder views adopt their existing side columns. |
| 1101px | Drawer becomes a horizontal masthead, minimum height 96px; search and account share one row below it. |
| 1201px | Reference index uses three columns with 40px gaps. |

Below the desktop masthead threshold, search occupies its own row. The drawer is `min(88vw, 340px)` wide. At phone widths the season action becomes full-width, shortcuts stack, and the season panel uses 20px inner side padding. Home standings remain a three-column fixed-layout table with `min-width: 0`, a 40px rank column and a 90px points column; long names wrap in the middle column. Preserve that exception to the global wide-table minimum. Larger data tables use their existing card alternatives or contained horizontal scrolling, never page-level overflow.

## Elevation & Depth

Resting content is flat: opaque tonal layers and one-pixel borders establish depth. Cards do not float or lift on hover. Temporary overlays carry the meaningful shadows: drawer (12px 0 36px at 25% black), authentication dialog (0 24px 80px at 52% black), and toast (0 8px 24px at 35% black). Exact CSS values live in the sidecar.

**The Solid Ground Rule.** Keep permanent surfaces opaque and border-led; reserve shadow for temporary surfaces above the page.

Motion describes short state changes: the drawer slides over 180ms ease-out, its overlay fades over 180ms, and toasts enter over 160ms ease-out. Reduced-motion settings reduce animation and transition duration to 0.01ms and restore automatic scroll behavior.

## Shapes

Small standard corners unify buttons, fields, cards, dialogs and focus rings. The emblem has a slightly tighter corner; the existing roster pill is the explicit rounded exception. Thin rules divide rows and groups. Reference index rows have square corners and transparent backgrounds rather than a repeated box around every link. Directional arrows are simple stroked inline SVGs, usually 20px; keep the supplied emblem intact.

## Components

### Buttons

Confident, compact controls. Primary buttons are centered inline-flex actions, minimum height 44px, with copper fill, white text and 14px side padding. Hover deepens the fill and brightens the border. Ghost buttons use the theme's panel, text and line with 10px side padding and the same 44px minimum. Disabled buttons use 0.6 opacity and a not-allowed cursor. Keyboard focus is a 2px focus-colored outline with 2px offset; it must remain visible.

### Chips and filters

Compact chips and filter buttons use the same surface contract, with a 34px minimum height. Hover strengthens the border and changes to panel-2. Selected filters use the active-button aliases; the selected state is a border-and-surface treatment, not only a text-color change. Roster pills retain their existing capsule shape and smaller typography.

### Cards and containers

Ordinary linked cards have standard corners, 16px padding and a 122px minimum height (88px for compact cards). Hover brightens the border without translation or shadow. Content panels start with 14px padding, rising to 22px from 601px. The home season panel carries the larger journal composition; the team tool uses the dark masthead palette with 26px padding, or 24px 20px on phones.

### Inputs and fields

Labels sit above fields with a 6px gap. Inputs and selects have solid panel backgrounds, one-pixel line borders, standard corners and a 44px minimum height. Search has a 46px minimum height, 16px text and an inset search SVG. Focus changes the border to the focus token and adds the shared keyboard outline. Error messages use the danger text, border and background pair.

### Navigation

The dark club masthead pairs the supplied 48px emblem with a condensed wordmark. Navigation links have a 48px minimum height; active links combine the dark highlight surface and copper bottom rule. Theme and language controls remain available in both frame modes. The mobile drawer has a scrim and explicit close button; opening focuses that button and makes the main content inert. Tab cycles within visible enabled drawer controls; Escape closes and returns focus to the opener. Closing also removes the drawer from keyboard traversal. Preserve these behaviors when changing its appearance.

### Journal rows and standings

Shortcuts and rules are generous ruled links with right-aligned arrows. Their title and optional muted description stay together, with hover emphasis on the link. Home standings use restrained headers, raised tonal cells, thin borders, wrapped names and tabular points. Loading, unavailable and empty states occupy the same season workspace and explain the actual data state; decorative fixtures must never replace missing data.

## Do's and Don'ts

### Do:

- **Do** use semantic CSS aliases and check all six theme IDs.
- **Do** retain the supplied emblem, Oswald headings and Golos Text reading text.
- **Do** check English and Russian at desktop and phone widths.
- **Do** preserve visible keyboard focus, drawer containment and reduced-motion behavior.
- **Do** keep compact home standings shrinkable and long team names readable.
- **Do** use real loading, empty and unavailable states when live data is absent.

### Don't:

- **Don't** reintroduce decorative glass, glows or patterned backgrounds through legacy aliases.
- **Don't** replace ruled reference lists with a uniform grid of floating cards.
- **Don't** use primary-action colors as a substitute for semantic status colors.
- **Don't** remove existing theme choices or treat Russian labels as secondary.
- **Don't** promote synthetic screenshot names, dates or scores into product claims.

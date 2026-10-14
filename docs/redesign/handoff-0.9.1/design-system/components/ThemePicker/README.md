# ThemePicker

Settings → Оформление. The coach picks a **mode** and a **whole palette** for it — not just an accent.

**Mode:** SegmentedControl Светлая / Тёмная / Как в системе. In «Как в системе» two palette rows are shown, one per mode, and the site follows the OS.

**Palette card:** a live miniature of the palette — header strip (`header` + gold crest dot), a card with an ink line, a muted line, an accent pill and a tint pill — then the name and a one-line mood. Selected: 2px ring in the current accent. Cards sit two per row on mobile, two per row in the desktop side column; previews always render in their own colours, regardless of the current theme.

**What a palette sets:** `header` (app header / SideNav), `page`, `desk` (desktop canvas), `card`, `surface-2`, `track`, `segOn`, `ink`, `muted`, `faint`, `line`, `ring`, `field`, `off` (inactive toggle), `accent`, `accent text` (accent used as text on this surface), `tint`, `on-tint`. Status colours (warn, danger, good) follow the mode, not the palette.

| Mode | Palette | Mood | header | page | card | ink | accent |
|---|---|---|---|---|---|---|---|
| Светлая | Идеальная погода | классика лиги, свежий газон | `#17392C` | `#FFFFFF` | `#FFFFFF` | `#14201A` | `#2F7A52` |
| Светлая | Палящий зной | песок, пергамент, ржавчина | `#3B2A1A` | `#FBF6EC` | `#FFFBF3` | `#2A1E12` | `#9A4A1C` |
| Светлая | Метель | холодно, как в Норске | `#1E3A5F` | `#FFFFFF` | `#FFFFFF` | `#0F1B2A` | `#1D5FA8` |
| Светлая | Имперская знать | бордо и слоновая кость | `#5A1220` | `#FFFDF8` | `#FFFFFF` | `#1F1414` | `#8E1B2E` |
| Тёмная | Под прожекторами | вечерний матч на газоне | `#17392C` | `#0F1A15` | `#15231C` | `#E8EFEB` | `#2F7A52` |
| Тёмная | Тёмные эльфы | камень и фиолет | `#241A33` | `#121018` | `#1A1722` | `#ECE8F3` | `#7A4BB0` |
| Тёмная | Пламя Хаоса | уголь и огонь | `#2A1A12` | `#121110` | `#1B1917` | `#F1ECE6` | `#C2571A` |
| Тёмная | Проливной дождь | мокрый стадион ночью | `#0F2A3A` | `#0B141B` | `#111D26` | `#E6EEF3` | `#1F7A8C` |

Palettes are named in the Blood Bowl spirit — after match weather (Идеальная погода, Палящий зной, Метель, Проливной дождь) or a faction mood (Имперская знать, Тёмные эльфы, Пламя Хаоса) — never after a specific team. Every palette keeps ink/page ≥ 7:1 and accent text ≥ 4.5:1 on `card`.

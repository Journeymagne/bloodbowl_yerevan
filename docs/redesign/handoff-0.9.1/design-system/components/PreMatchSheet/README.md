# PreMatchSheet

«Перед матчем · Тур N»: inducements and missing players for both teams. Bottom sheet on mobile, 640px dialog on desktop. Opened from InfoBubbles (desktop board) or the inducement tile / missing line (MatchCard).

**Hero:** the one sanctioned gradient in the system. Left = us, right = opponent; the half of the team that receives inducements is `hero-gets` (green), the other `hero-pays` (red), blended across the middle 24%. Equal TVs: flat `hero-even`, centre reads «0 · TV равны — индьюсментов нет». Each side: team name, «TV», TV in 30px display, «В строю X из Y». Centre: amount and «индьюсменты нам / сопернику» as plain text — no box, no arrow.

**Missing players:** two columns, ours left-aligned, theirs right-aligned, separated by one vertical `line` — no horizontal rules. Each player: «#9 J. Corr» (opponent: «Elriel #4»), position, reason in `danger`, return round. Empty column: «Пропусков нет» in `faint`.

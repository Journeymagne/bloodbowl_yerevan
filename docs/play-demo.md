# GATA virtual tabletop demo

Run the league site with `npm start`, then open <http://localhost:3002/play> or choose **Play online · Demo** in the sidebar. Sign in with an existing league account to select database teams. Team cards and public team profiles also link to the tabletop with that team preselected. The tabletop UI is English.

`npm run demo` at <http://localhost:5174> remains a standalone practice server with the two sample squads and no database requirement.

## League teams

The picker lists every saved team, searchable by team name, race or coach. Preview a preferred lineup; the full roster joins the exhibition. Before each drive the coach chooses up to seven players, with at least three Linemen when available and at most four specialists. Seven is a maximum, not a required count. Players missing the next game or temporarily retired cannot enter the lineup. An empty roster stays visible with an explanation and cannot start a match.

Names, jersey numbers, positions, current characteristics (including improvements and lasting injuries), base/added/favoured/captain skills, total SPP, rerolls, assistant coaches, cheerleaders and Bribes come from the existing roster domain. Reserves stay on the bench until the coach fields them during setup. Each drive allows manual substitutions and positioning. Auto formation preserves the currently selected players, including a deliberately smaller lineup. Other than the Human/Orc practice art, teams use neutral helmet counters coloured by side.

The server reads the selected teams again when starting a local match or online room. Only team IDs and lineup player IDs are accepted; client-supplied stats and dice cannot replace server values. Both coaches must sign in to join a database-team room. These are **exhibition matches**: no roster, SPP, treasury, preparation, season or match-result records are updated.

### Supplied dump preview

The 2026-10-18 dump was restored into the isolated local container `gata-play-preview-20261020`, database `gata_play_preview`, bound to `127.0.0.1:5546`. The existing `gata-league-postgres` container was left untouched. All 22 saved teams were checked: 21 have players and start successfully; the empty Amazon roster requires players first.

The preview configuration is local and ignored by git at `output/play-preview.env`. To restart this particular preview in PowerShell:

```powershell
docker start gata-play-preview-20261020
$env:BLOODBOWL_ENV_FILE = Join-Path (Get-Location) 'output/play-preview.env'
npm start
```

Stop any existing listener on port 3002 before restarting. A normal deployment uses its configured database through `DATABASE_URL`; no additional schema migration is needed for the tabletop.

The interface follows Vassal's virtual-tabletop layout: a toolbar, coordinate grid, static counters, rosters, inspector, dice and shared game log. Reference: [Vassal toolbar](https://vassalengine.org/doc/latest/ReferenceManual/Toolbar.html).

## Appearance

The palette button in the header opens **Appearance**. The eight palettes come from the user-supplied `Gata-League-v0.7.zip` design system:

- Light: Perfect Weather, Sweltering Heat, Blizzard, Imperial Nobility.
- Dark: Under the Floodlights, Dark Elves, Flames of Chaos, Pouring Rain.

Light and dark choices are remembered separately on this device. System mode follows the operating system's colour preference. Changing appearance does not change the match, team colours or gameplay weather.

The table uses the archive's Barlow and Barlow Condensed fonts, colours, rounded cards and button styling. Fonts are served locally; their OFL licence is included in `assets/fonts/barlow/OFL-Barlow.txt`. `palettes.mjs` stores the source palette data, `palettes.css` defines the matching CSS tokens, and `themes.mjs` controls the picker. `theme-boot.js` restores the palette before styles load.

## Play

Start with the drive panel above the pitch:

1. Each coach confirms their Autumn weather die, then rolls off for kick/receive choice. Ties repeat.
2. The kicking coach selects and positions their lineup, then locks it. The receiving coach follows. Use **Bench / Field** below the pitch and select a player followed by an empty square to reposition them.
3. Formations require three central Line of Scrimmage players (all if fewer remain), no more than one player in each wide zone and everyone in their own half. With fewer than three available Linemen, the minimum drops to those available. Coaches choose the remaining lineup size, up to seven.
4. Nominate a kicker behind the central LOS, select a target in the receiving half and confirm the kick.
5. Confirm deviation, the 2D6 GATA kickoff event and its decisions or additional dice. The ball stays airborne until the event finishes.
6. Resolve the catch, bounce or touchback. Kickoff catches may use Catch, never a team reroll; failure does not cause a turnover. A touchback lets the receiving coach choose possession. If no receiver can hold the ball, choose whose square it bounces from.

Only then does the receiving team's first turn begin. After a touchdown, and again at half-time, KO recovery rolls precede fresh lineup selection and another kickoff. Casualties remain out; players sent off by Fight with the Ref return after the half ends. Ends switch at half-time and the team that kicked first receives. With no available players, the exhibition ends without changing league records.

Select a counter (or roster miniature), choose an action, then select a destination or target. Keys 1–5 select actions; Escape ends an activation. Arrow keys navigate the focused grid. White dots are reachable squares; yellow dots require rushing. A path preview shows the route before clicking. Selecting another player does not activate them until an action is performed.

The dice tray sits above the player inspector on the right. Every roll follows the same sequence: **Roll → dice animation → optional reroll → Confirm result**. Choosing a reroll opens a second confirmation; the resource is spent only when the reroll is thrown. Skill rerolls (Dodge, Pass, Sure Hands and Catch) are optional. A rerolled result cannot be rerolled again. Movement, scoring and subsequent rolls wait for the current result to be accepted.

D6 show pips, D8 show their number, and block dice use original vector drawings of the five standard symbols: skull, skull/burst, push arrow, outlined burst with an exclamation mark, and solid burst. Push occupies two faces. The tray includes a labelled face guide. Armour and injury are separate 2D6 rolls, and a block throws its full 1–3 die pool together. Reduced-motion settings skip the throwing animation.

After keeping block dice, the appropriate coach chooses a face, a push destination and whether to follow up. **Follow-up / Stay is decided before armour, injury or any ball-bounce dice.** The attacker moves immediately if following up, then the remaining block effects resolve. On unfavourable blocks the attacker decides whether to reroll before the defender selects a die. Both browsers display the same server-generated dice; only the responsible coach can confirm. Reconnecting preserves the pending throw/result. Local movement can be undone only before new dice or possession changes. “Save” exports the state and log as JSON; the log can also be exported as text.

“Local hotseat” opens the room dialog. Creating a room opens the team picker and assigns the home team to the host. The invitation gives the second coach the away seat. On the same computer use another browser or private window; reloading the same tab resumes its own seat. On another device replace `localhost` with the host computer's LAN address, and use the same port.

The server listens on port 5174 (`PLAY_PORT` overrides it). Internet play needs hosting with HTTPS and support for streaming `/api/play/` responses. This task does not deploy an internet-facing service. A static build alone supports local play; it cannot host rooms.

## Rules coverage

Implemented: 20 × 11 Sevens pitch, full rosters with up to seven fielded per team, bench and manual drive setup, pre-game weather and kick/receive roll-off, kickoff sequence, movement budget, standing up, tackle zones, dodging, two rushes, pickup, handoff, short passes, catches, assists, block dice selection, pushing, follow-up, blitz, armour, injury, KO recovery, turnovers, rerolls, touchdowns, SPP, six turns per side in each of two halves, and switching ends at half-time.

GATA sources are `content/Gata/General Information/All Gata Changes.md`, `Kick-off Table.md`, `Weather.md` and the roster pages. The demo applies:

- Three central LOS players; at most one in each wide zone and at most four specialists. The user-requested lineup also requires three available Linemen.
- No first-turn drive touchdown; a carrier waiting in the end zone scores at the beginning of its second turn.
- Block only during the player's own activation; Dodge does not stop Stumble; Evasive does, unless cancelled by Tackle.
- A KO inflicted by a block awards 1 SPP.
- Kick deviation distance is `floor(D6 / 2)`, including zero.
- Throw-in distance uses D6.

The GATA kickoff table covers Bribes, Timeout, Solid Defence, High Kick, Cheering Fans, Brilliant Coaching, Changing Weather, Quick Snap, Blitz, Fight with the Ref and Pitch Invasion. Eligible Open players are captured when the event occurs. Event moves and nominations belong to the correct coach. Brilliant Coaching rerolls expire after the drive; Cheering Fans boosts the next Block; Bribes are counted. Random player selection uses a numbered virtual die with its candidate list in the tray.

Autumn weather is implemented: fallen leaves modify armour, chill modifies KO recovery, rain modifies catches/pickups, and wind uses its direction/template/D8 kick distance. Changing Weather uses the project's D6 table and three extra scatters for normal conditions. Other seasonal weather tables are not selectable yet.

This is a playable prototype, **not a complete Blood Bowl 2025 / GATA rules engine**. There is no fouling, interception, full passing template, long pass, Throw Team-mate (including kickoff Blitz), apothecary, inducement purchasing or complete skill catalogue. Bribes are tracked but cannot yet be spent. Only Block, Dodge, Evasive, Tackle, Pass, Sure Hands and Catch are automated. Other imported skills are marked as reference-only in the picker and inspector.

Explicit simplifications: pass range uses grid distance, inaccurate passes bounce once near the receiver, failed pass/handoff catches turn over, throw-ins go straight inward, and forced chain pushes continue straight. Blitz blocks currently need one non-rush movement point. Crowd-stunned players return to reserve; crowd KOs and casualties keep their respective statuses.

## Architecture and validation

- `src/play/model.mjs`, `flow.mjs`, `blocks.mjs`, `engine.mjs`: shared state machine; commands clone state before validation, so failed commands cannot partially mutate a match.
- `src/play/lineup.mjs`, `drives.mjs`, `kick-events.mjs`, `kick-weather.mjs`: bench, setup, pre-game, kickoff event and landing transitions.
- `src/play/drive-panel.mjs`, `drive-panel.css`: shared phase controls, formation feedback and roster/bench groups.
- `src/play/rolls.mjs`: serializable roll checkpoints. Commands resume using confirmed dice only; future dice are never generated in advance. Team and skill rerolls are validated here, and chat added during a pause is preserved.
- `src/play/dice-tray.mjs`, `dice-faces.mjs`, `dice-tray.css`: dice tray controls, original SVG faces, animation and reduced-motion support.
- `src/play/app.mjs`, `render.mjs`, `network.mjs`, `table.css`: standalone English demo UI, separate from the bilingual league application.
- `server/play/rooms.mjs`: in-memory rooms, two secret seat credentials, optimistic version checks, server-generated dice, Server-Sent Events and chat. No client-submitted game state is accepted.
- `server/play/teams.mjs`, `handler.mjs`: authenticated read-only team catalogue and canonical match creation; mounted in the league server.
- `src/play/setup.mjs`, `squads.mjs`: team/lineup selection and roster-to-pitch conversion.
- `scripts/serve-play.mjs`: dedicated server, reusing the existing static-file allowlist.
- `public/play.html`, `assets/play/*.svg`: entry page and original static vector counters. Existing build copies them automatically.

Rooms expire after two idle hours with no connected clients and disappear on server restart. They are demonstration sessions without durable storage or league settlement.

Checks: `node --test test/play-engine.test.mjs test/play-dice.test.mjs test/play-drives.test.mjs test/play-rooms.test.mjs test/play-integration.test.mjs`, `npm run check`, `npm run i18n:check`, `npm test`, `npm run build`. Room/integration tests open a temporary loopback listener. Lifecycle tests cover coach-selected smaller lineups, substitution/formation constraints, each kickoff event, catch/touchback, halftime/KO recovery, serialized dice checkpoints and online coach ownership.

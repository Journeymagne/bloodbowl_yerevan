---
name: ui-preview
description: Generate an HTML before/after preview of this repo's UI changes (a branch against main by default) for a reviewer to look through in a browser — each changed component or screen rendered by each version's own markup functions, in that version's built CSS and fonts, side by side, with a light/dark switch; published as a private page and kept as a local folder. Use when the user asks for preview HTML, a visual review, before/after pages, or "хтмлки превью" for a PR.
---

# UI preview (Gata Blood Bowl League)

A page a reviewer opens instead of running the branch: for every visible change, the `main` version and the branch
version side by side. The pictures are not redrawn by hand: each side's HTML comes from that checkout's own render
functions (fed the same fixtures), and each side wears that checkout's own `dist/src/styles.css`. Nothing in the repo
changes; everything goes to `output/previews/<name>/` (git-ignored) and the scratchpad.

Scripts beside this file: `render.mjs` (fragments of one checkout), `build.mjs` (the page), `example-recipes.mjs`
(the recipes of the first preview, to copy from).

## 1. What changed, and how to show it

Read the diff (`diff --stat <base>`, then the changed `src/` files) and list the visible changes, grouped as the PR
description groups them (Major / Normal / …). For each, pick how it is drawn:

- **A component or a screen whose markup is a function** (`manageMarkup(manageModel(…))`, `renderSkillChips`,
  `settingsMarkup`, `renderResourceCounter`, `renderTreasuryStrip`…): a recipe calls it on both sides. Prefer the
  screen's whole markup function over a hand-made piece: it shows the change in its place.
- **Markup inside a sheet** (`#player-edit`, `#player-advance`, …): its rules are scoped by the sheet's id, so the
  recipe wraps the markup in an element with that id. Write the markup by hand only when no exported function draws
  it, copying it from the version's own source (`git show <base>:<file>` for main).
- **Something only one side has**: the other side shows a `g-preview-none` note saying where it lives on that side.
- **A wording change**: a row in `renames` (EN · RU per side). When the word shows inside a component (a chip's
  source line, a sheet's title), the component's frame shows it too, from each side's dictionary.
- **What needs a running app** (the overview with its live reads, a sheet after some clicks, a live match's panel):
  a screenshot pair — from `output/screens/<name>/{before,after}/` if a run already holds it, or from a small states
  file of your own taken with `--only` on both sides (a minute; see §4). Never start the whole run for a preview
  without asking — 950 shots a side take ~35 minutes.

Pick the width per section: `desk` (laid out at 1100px, ≥ 901px rules) or `phone` (390px).

**Cover the whole description.** Go through the PR description's items one by one and give every Major and Normal one
a place: a section, a screenshot, a row of `renames`, or a row of `notShown` (what a still page cannot show — a
behaviour, focus, a screen reader's words, a non-UI change — with how to check it by hand). Nothing is left out
silently; Minor items may be.

- **A sheet** (an advancement's step, a skill's rule): render it with `renderSheet` and open it in the recipe
  (`html.replace("<dialog", "<dialog open")`); the frame draws an open sheet where it stands, at its whole height, with
  no backdrop. Show the sheet around a change made inside one — the change alone loses its place.
- **Screenshots go stale.** A screenshot taken before a later code change shows the old branch: retake the states the
  page uses on both sides after the last change (`npm run screens -- <states> --out … --only <id,id>`, a minute), never
  reuse older ones.

## 2. Two checkouts

The branch is the repo itself. `main` is a clean worktree in the scratchpad (as the review skill's baseline):

```powershell
$g = (Get-Command git -ErrorAction SilentlyContinue).Source; if (-not $g) { $g = (Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" | Select-Object -Last 1).FullName }
$base = "<scratchpad>\preview-base"
if (Test-Path $base) { & $g worktree remove --force $base 2>$null; if (Test-Path $base) { Remove-Item $base -Recurse -Force } }
& $g worktree prune
& $g fetch origin --quiet
& $g worktree add --detach $base origin/main
Push-Location $base; npm ci --prefer-offline --no-audit --no-fund | Out-Null; npm run build | Out-Null; Pop-Location
npm run build | Out-Null   # the branch's dist/ too: each side's frames use its own built stylesheet
```

Never link the repo's `node_modules` into the worktree (`git worktree remove --force` follows the link).

## 3. Recipes, then fragments

Copy `example-recipes.mjs` to the scratchpad and write the PR's recipes: one key per fragment, a function that
returns HTML. `load(file)` imports from the checkout being rendered, so the same recipe draws each side with its own
code; `t` is that side's dictionary; `branch` is true on the branch's side. Use the test fixtures' data
(`test/*.test.mjs` show what a model needs) so both sides draw the same team, and a recipe that throws becomes a note
instead of stopping the run.

Write every helper as a file in the scratchpad and run it with `node <file>`: an inline `node -e "…"` with JavaScript
in it is mangled by PowerShell's quoting (regexes, `||`, quotes) and fails before it runs.

```powershell
$env:PREVIEW_SIDE = "before"; node .claude/skills/ui-preview/render.mjs $base <scratchpad>\recipes.mjs <scratchpad>\frag-before.json
$env:PREVIEW_SIDE = "after";  node .claude/skills/ui-preview/render.mjs .     <scratchpad>\recipes.mjs <scratchpad>\frag-after.json
Remove-Item Env:PREVIEW_SIDE
```

Each prints every fragment's size and `NOT RENDERED` for one that failed: fix the recipe (usually a model field the
function needs) and run again.

## 4. The spec, then the page

Write `<scratchpad>\preview-spec.json`:

```json
{
  "title": "UI v2 Polish Part 1",
  "repo": ".", "base": "<scratchpad>\\preview-base", "out": "output/previews/ui-v2-p1",
  "fragments": { "before": "<scratchpad>\\frag-before.json", "after": "<scratchpad>\\frag-after.json" },
  "labels": { "before": "main", "after": "this branch" },
  "intro": ["Before and after for <code>imp/UIv2-update-p1</code>, rendered by each version's own code from the same fixture team …"],
  "groups": ["Major", "Normal"],
  "sections": [
    { "id": "team-desk", "group": "Major", "title": "Team page on a desk", "width": "desk", "keys": ["teamDesk"],
      "what": "What changed, in the PR description's words.",
      "look": "the top of the left column (main: the strip; branch: one «Treasury» card) and History's fold.",
      "markBefore": [".g-funds", ".g-ledger__actions"], "markAfter": [".g-manage__treasury", ".g-ledger__actions"] }
  ],
  "shots": { "dir": "output/screens/ui-v2-p1", "note": "From npm run screens, same mock coach, light mode.",
    "items": [{ "file": "06-C1-1440-light.png", "title": "Overview on a desk", "what": "…", "look": "the «Team leaders» block.",
      "area": { "x": 250, "y": 510, "width": 1175, "height": 770 }, "boxes": [{ "x": 264, "y": 524, "width": 736, "height": 190 }] }] },
  "renames": [["The «Table» tab", "Table · Таблица", "Standings · Турнир"]]
}
```

`intro` lines are HTML (write `<code>` yourself; nothing else in the spec is). `shots`, `renames` and `notShown`
(`[["change", "how to check it"], …]`) are optional. `palettes` (`{"light": "grass", "dark": "night"}`) sets what the
light/dark switch puts on the frames. Frame helpers for a recipe's markup: `g-preview-col` (a 420px column),
`g-preview-label` (names a part of a frame), `g-preview-none` (a note), `g-preview-tiles` (four tiles in a 380px panel).

**Say what changed on each side.** `what` names the before and the after in plain words a reviewer can check against
the picture ("main: a navigation row, full width, a chevron at the right; branch: a green link like «Correct the
treasury by hand»"), not only the new state: «reads as a link» does not say what it read as before.

**Say where to look.** A reviewer facing a whole screen does not know which of its fifty rows changed, least of
all when the two sides do not fit in one row. So every section and every shot gets:
- `look`: one sentence naming the spot and what to compare in it ("the top of the left column (main: the strip;
  branch: one «Treasury» card), the buttons at the right of the settings rows"). Shown as a «Look at» line.
- for a frame, `mark` (both sides), `markBefore`, `markAfter`: CSS selectors of what changed, outlined in pink inside
  the frames. Check the selectors exist in that side's fragment (grep the fragment JSON) — a side without the element
  just shows no outline. Skip marks on a frame small enough that the change is the whole of it. Where the outline
  would sit on the thing's own ring or border (a palette card), give the section `markOffset` (px, 3 by default) so
  the two read apart.

**Show a change where it can be judged.** A lone element out of its place often hides what changed: a line that
became a link means nothing without what is around it. Put the field above it, or the other place the change makes it
match, in the same frame (a `g-preview-label` paragraph names each part). Words come from each version's own
dictionary (`t()` in the recipe), never typed into the recipe, so a renamed word shows as renamed.

**Cut screenshots to the change.** A screenshot pair of the same size is cut automatically to where the two differ
(the `screens:diff` box, plus a 48px margin), the changed box outlined. A cut narrower than 60% of the screen takes
the screen's whole width, so it keeps its place; a cut is never shown larger than its own pixels.
When the sizes differ the whole layout moves and every pixel differs (`main`'s desk shots were 15px narrower while it
kept a scrollbar gutter), so give the cut yourself, in the branch picture's pixels: `area` `{x, y, width, height}`
and `boxes` (a list of the same shape) for what changed inside it. Read the branch's PNG to pick them. A box is drawn
at the same place on both sides, so where `main`'s layout sits further left, widen it leftwards until it holds the
change on both, or it cuts through `main`'s text. `whole: true` shows a pair uncut.
A shot with `group` (one of `groups`, or the build stops) stands in that group after its sections, linked from the
contents bar, not in the «Screenshots» block at the end: use it when a change is best seen in the running app (a
sheet's state after clicks, a live match's panel, a 1px line). Write a small states file for those states (as
`npm run screens` takes, its `run` steps clicking through) and take it on both sides with `--only <id>`.

```powershell
node .claude/skills/ui-preview/build.mjs <scratchpad>\preview-spec.json
```

It writes `index.html`, `frames/`, `css/`, `fonts/`, `shots/` and `files.json` (the supporting files to publish).

How the page works, so a change to it does not break it:
- A frame is the fragment inside `<section id="app-view">` with no app frame around it: the desk frame grid keeps a
  SideNav column, and content without the SideNav lands in that narrow column.
- The page and its frames talk by `postMessage` (height up, light/dark down): opened from disk (`file://`), a page may
  not reach into its frames.
- A desk frame lays out at 1100px and is scaled to its half of the row; below 720px the pair stacks.

## 5. Look once, publish, hand over

Take one look before publishing: a headless Chrome shot of the local `index.html` with its own profile
(`--headless=new --user-data-dir=<scratchpad>\chrome-look --allow-file-access-from-files --window-size=1500,<height>
--virtual-time-budget=9000 --screenshot=…`; Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe`;
start it with `Start-Process -Wait`). The window must be as tall as the whole page — a short one never reaches the
screenshot pairs at the end, where a picture that does not load hides (it happened). Cut the tall shot into slices
of about 2500px (System.Drawing) and read each, the last one first. Fix what it shows, once, then publish.

Publish with the Artifact tool (its quickstart first, as the tool asks for a new page): `file_path` the `index.html`,
`root` the out folder, `files` the list in `files.json`, an `icon`, a one-line `description`. The page is private:
tell the user that the reviewer cannot open it until it is shared from the page's Share menu, and that the same
folder can be zipped instead (open its `index.html`). To update it later, rebuild and publish the same `file_path`
(only the changed supporting files need sending).

Then clean up, or say what is left running: the `preview-base` worktree (`& $g worktree remove --force $base`), and
any mock server started for screenshots.

## Limits to say in the hand-over

- Nothing is clickable: no app script runs in a frame. Sheets show as their content, not open over a page.
- Fixtures, not real data: the mock coach and the test fixture teams only.
- One look was taken; the published page was not looked at again unless it was.

// Builds a before/after preview page from two fragment files (render.mjs) and a spec.
//   node build.mjs <spec.json>
// Writes <out>/index.html, frames/ (one page per section and side), css/, fonts/, shots/ and <out>/files.json, the
// list of supporting files to publish with the page. The spec's fields are described in SKILL.md.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const specPath = process.argv[2];
if (!specPath) {
  console.error("usage: node build.mjs <spec.json>");
  process.exit(2);
}
// PowerShell's Set-Content -Encoding utf8 writes a byte-order mark, which JSON.parse refuses.
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
const spec = readJson(specPath);
const repo = path.resolve(spec.repo);
const base = path.resolve(spec.base);
const out = path.resolve(spec.out);
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ["frames", "css", "fonts", "shots"]) fs.mkdirSync(path.join(out, dir), { recursive: true });

const frags = {
  before: readJson(spec.fragments.before),
  after: readJson(spec.fragments.after),
};
// Each side wears its own built stylesheet (npm run build in each checkout first); the fonts are the same.
fs.copyFileSync(path.join(base, "dist", "src", "styles.css"), path.join(out, "css", "before.css"));
fs.copyFileSync(path.join(repo, "dist", "src", "styles.css"), path.join(out, "css", "after.css"));
for (const file of fs.readdirSync(path.join(repo, "assets", "fonts", "ui"))) {
  if (/\.(woff2|css)$/.test(file)) fs.copyFileSync(path.join(repo, "assets", "fonts", "ui", file), path.join(out, "fonts", file));
}

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DESK = 1100;
const PHONE = 390;
const labels = { before: spec.labels?.before ?? "main", after: spec.labels?.after ?? "this branch" };

// What a section asks the reader to look at is outlined in its frames: one colour, outside the app's palettes.
const MARK = "#d6336c";
// `offset`: how far out of what it marks the outline stands; a section raises it where the mark would sit on the thing's
// own ring (a palette card's), so the two read apart.
const markCss = (selectors, offset = 3) => (selectors.length
  ? `${selectors.join(",\n")}{outline:3px solid ${MARK} !important;outline-offset:${offset}px !important}` : "");
const FRAME_CSS = `body{margin:0}
#app-view.g-preview{display:block;box-sizing:border-box;width:100%;max-width:none;margin:0;padding:16px}
#app-view.g-preview > * + *{margin-top:16px}
.g-preview-col{display:flex;flex-direction:column;gap:12px;max-width:420px}
.g-preview-label{margin:0 0 8px;color:var(--muted);font:600 11px/1.3 var(--font-body);letter-spacing:.06em;text-transform:uppercase}
.g-preview-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:380px;max-width:100%}
/* A sheet a recipe opened (<dialog open>) stands where it is drawn: no modal, no backdrop, its whole height. */
dialog.g-sheet[open]{position:static;margin:0 auto;max-height:none}
dialog.g-sheet[open] .g-sheet__panel,dialog.g-sheet[open] .g-sheet__body{max-height:none}
.g-preview-none{margin:0;padding:16px;border:1px dashed var(--line-strong);border-radius:12px;color:var(--muted);font:400 14px/1.4 var(--font-body)}`;

// A frame: the fragment inside the app's view, without the app's frame (its desk grid keeps a SideNav column, and
// the content would land in it). Messages, not the parent reaching in: a page opened from disk may not touch its frames.
const frame = (side, html, marks = [], markOffset = 3) => `<!doctype html>
<html lang="en" data-mode="light" data-palette="${spec.palettes?.light ?? "grass"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(labels[side])}</title>
<base target="_blank">
<link rel="stylesheet" href="../fonts/fonts.css">
<link rel="stylesheet" href="../css/${side}.css">
<style>${FRAME_CSS}
${markCss(marks, markOffset)}</style>
</head>
<body><section id="app-view" class="g-preview">${html}</section>
<script>
(() => {
  const root = document.documentElement;
  const palettes = ${JSON.stringify({ light: spec.palettes?.light ?? "grass", dark: spec.palettes?.dark ?? "night" })};
  const send = () => parent.postMessage({ previewHeight: root.scrollHeight }, "*");
  addEventListener("message", (event) => {
    if (!event.data || !event.data.previewMode) return;
    root.setAttribute("data-mode", event.data.previewMode);
    root.setAttribute("data-palette", palettes[event.data.previewMode]);
    send();
  });
  addEventListener("load", send);
  if (document.fonts) document.fonts.ready.then(send);
})();
</script>
</body>
</html>
`;

const missing = [];
for (const section of spec.sections) {
  for (const side of ["before", "after"]) {
    const html = section.keys.map((key) => {
      if (!(key in frags[side])) missing.push(`${side}:${key}`);
      return frags[side][key] ?? "";
    }).join("");
    const marks = [...(section.mark ?? []), ...(section[side === "before" ? "markBefore" : "markAfter"] ?? [])];
    fs.writeFileSync(path.join(out, "frames", `${section.id}-${side}.html`), frame(side, html, marks, section.markOffset));
  }
}

// A screenshot pair is cut to where the two differ (the box screens:diff finds), with a margin, so the big same parts
// go. Pairs of different sizes differ everywhere: their cut is the spec's `area` and `boxes`.
// An item is a pair, or a page (`parts`): under its title, each part's changes, one line each, then that part's pair.
const shotId = (file) => `shot-${file.replace(/\.png$/, "")}`;
const shots = (spec.shots?.items ?? []).map((shot) => ({ id: shot.id ?? shotId(shot.file ?? shot.parts[0].file), ...shot }));
const pairs = shots.flatMap((shot) => shot.parts ?? [shot]);
const { comparePngs, decodePng } = await import(pathToFileURL(path.join(repo, "scripts", "screenshots", "png.mjs")).href);
const MARGIN = 48;
// Two full-page shots of different heights: the box where they differ inside the part both have, top-aligned.
function sharedBox(first, second) {
  const width = Math.min(first.width, second.width);
  const height = Math.min(first.height, second.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = (y * first.width + x) * 4, b = (y * second.width + x) * 4;
      if (first.rgba[a] === second.rgba[b] && first.rgba[a + 1] === second.rgba[b + 1] && first.rgba[a + 2] === second.rgba[b + 2]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
for (const shot of pairs) {
  const sources = Object.fromEntries(["before", "after"].map((side) => [side, path.join(spec.shots.dir, side, shot.file)]));
  for (const side of ["before", "after"]) fs.copyFileSync(sources[side], path.join(out, "shots", `${side}-${shot.file}`));
  const [first, second] = ["before", "after"].map((side) => decodePng(fs.readFileSync(sources[side])));
  shot.sizes = { before: { width: first.width, height: first.height }, after: { width: second.width, height: second.height } };
  shot.narrower = first.width !== second.width;
  if (shot.whole) continue;
  // An area given in the spec wins: when the widths differ the whole layout moves, every pixel differs, and only the
  // author knows where the change is.
  if (shot.area) {
    shot.crop = shot.area;
    shot.boxes = shot.boxes ?? [];
    shot.picked = true;
    continue;
  }
  const box = first.width === second.width && first.height === second.height ? comparePngs(first, second).box : sharedBox(first, second);
  if (!box) continue;
  const bottom = Math.min(first.height, second.height);
  const right = Math.min(first.width, second.width);
  let x = Math.max(0, box.x - MARGIN);
  let width = Math.min(right, box.x + box.width + MARGIN) - x;
  // A cut much narrower than the screen loses its place in it: it takes the screen's whole width instead.
  if (width < right * 0.6) {
    x = 0;
    width = right;
  }
  const y = Math.max(0, box.y - MARGIN);
  shot.crop = { x, y, width, height: Math.min(bottom, box.y + box.height + MARGIN) - y };
  shot.boxes = [box];
}

const widthLabel = (width) => (width === "desk" ? `Desk · ${DESK}px` : `Phone · ${PHONE}px`);
const pane = (section, side) => `<figure class="pane"><figcaption><span class="tag tag--${side}">${esc(labels[side])}</span></figcaption>`
  + `<div class="scroller"><iframe class="frame frame--${section.width}" src="frames/${section.id}-${side}.html" title="${esc(section.title)}: ${esc(labels[side])}" loading="lazy"></iframe></div></figure>`;
// Where to look: said in words for every section, and outlined in the frames (`mark`) or boxed on a screenshot.
const lookHtml = (text) => (text ? `<p class="look"><span class="look__tag">Look at</span> ${esc(text)}</p>` : "");
// `what` is a sentence, or a list of changes: each a string or `{ text, items }`, its items the sides' words for it.
const whatItem = (item) => (typeof item === "string" ? `<li>${esc(item)}</li>`
  : `<li><strong>${esc(item.text)}</strong>${item.items?.length ? `<ul>${item.items.map(whatItem).join("")}</ul>` : ""}</li>`);
const whatHtml = (what) => (Array.isArray(what) ? `<ul class="change__list">${what.map(whatItem).join("")}</ul>` : `<p class="change__what">${esc(what)}</p>`);
const sectionHtml = (section) => `<section class="change" id="${esc(section.id)}"><header class="change__head"><h3>${esc(section.title)}</h3>`
  + `<span class="width">${widthLabel(section.width)}</span></header>${whatHtml(section.what)}${lookHtml(section.look)}`
  + `<div class="pair pair--${section.width}">${pane(section, "before")}${pane(section, "after")}</div></section>`;

const pct = (part, whole) => `${((part / whole) * 100).toFixed(3)}%`;
// A cut of the screenshot, as CSS: a box of the cut's shape, the whole picture placed in it so only the cut shows.
const cropHtml = (shot, side) => {
  const { crop } = shot;
  const size = shot.sizes[side];
  const alt = `${esc(shot.title)}, ${esc(labels[side])}`;
  if (!crop) return `<div class="scroller"><img src="shots/${side}-${esc(shot.file)}" alt="${alt}"></div>`;
  // Never wider than the cut's own pixels: a small cut blown up to the column reads as a smudge.
  const image = `width:${pct(size.width, crop.width)};left:${pct(-crop.x, crop.width)};top:${pct(-crop.y, crop.height)}`;
  const hits = (shot.boxes ?? []).map((box) => `<span class="crop__hit" style="left:${pct(box.x - crop.x, crop.width)};top:${pct(box.y - crop.y, crop.height)};`
    + `width:${pct(box.width, crop.width)};height:${pct(box.height, crop.height)}"></span>`).join("");
  // Not lazy: placed far up and left inside its box, a lazy picture is taken for off-screen and never loads.
  return `<div class="crop" style="aspect-ratio:${crop.width} / ${crop.height};max-width:${crop.width}px"><img src="shots/${side}-${esc(shot.file)}" alt="${alt}" style="${image}">${hits}</div>`;
};
// The owner's own review drew a pair this way: one small card, its title over «Before» and «After» side by side, each
// cut the same size, so the eye goes across rather than down. A pane opens the whole screenshot.
const SIDE_WORD = { before: "Before", after: "After" };
// A card is as wide as its two cuts at their own size (with its padding and gap): a small cut is never shrunk, and a
// cut of most of a desk's screen takes the page's whole width.
const cmpWidth = (shot) => 2 * (shot.crop?.width ?? shot.sizes.after.width) + 34;
const compareHtml = (shot, title) => `<figure class="cmp" style="max-width:${cmpWidth(shot)}px"><figcaption class="cmp__title">${esc(title)}</figcaption>`
  + `<div class="cmp__panes">${["before", "after"].map((side) => `<a class="cmp__pane" href="shots/${side}-${esc(shot.file)}" target="_blank" rel="noopener">`
    + `<span class="cmp__label cmp__label--${side}">${SIDE_WORD[side]} · ${esc(labels[side])}</span>${cropHtml(shot, side)}</a>`).join("")}</div></figure>`;
const partHtml = (page) => (part) => `<div class="part">${whatHtml(part.what)}${compareHtml(part, `${page.title} · ${part.phone ? "phone" : "desk"}`)}</div>`;
const pageHtml = (page) => `<section class="change" id="${esc(page.id)}"><header class="change__head"><h3>${esc(page.title)}</h3></header>`
  + `${page.parts.map(partHtml(page)).join("")}</section>`;
const shotHtml = (shot) => {
  if (shot.parts) return pageHtml(shot);
  const { before, after } = shot.sizes;
  const narrower = shot.narrower ? ` ${esc(labels.before)}'s picture is ${after.width - before.width}px narrower, so its layout sits slightly to the left.` : "";
  const taller = before.height !== after.height ? ` The page is ${after.height - before.height > 0 ? "taller" : "shorter"} by ${Math.abs(after.height - before.height)}px: below a change, the rest moves.` : "";
  const cut = shot.picked ? "Cut to the part that changed" : "Cut to where the two differ";
  const where = shot.crop
    ? `${cut}: ${shot.crop.width}×${shot.crop.height}px of the ${after.width}×${after.height}px screen, the changes boxed.${narrower}${taller}`
    : "Shown whole: the two pictures are the same.";
  return `<section class="change" id="${esc(shot.id)}"><header class="change__head"><h3>${esc(shot.title)}</h3>`
    + `<span class="width">${shot.phone ? "Phone" : "Desk"} · screenshot</span></header>${whatHtml(shot.what)}${lookHtml(shot.look)}`
    + `<p class="change__what">${where}</p><div class="pair pair--${shot.crop ? "crop" : shot.phone ? "phone" : "shot"}">`
    + ["before", "after"].map((side) => `<figure class="pane"><figcaption><span class="tag tag--${side}">${esc(labels[side])}</span></figcaption>${cropHtml(shot, side)}</figure>`).join("")
    + "</div></section>";
};

// A screenshot pair may name a group: it then stands with that group's sections, in order, not at the page's end.
const grouped = shots.filter((shot) => shot.group);
const loose = shots.filter((shot) => !shot.group);
const groupNames = spec.groups ?? [...new Set(spec.sections.map((section) => section.group))];
const lost = [...spec.sections, ...grouped].filter((entry) => !groupNames.includes(entry.group));
if (lost.length) throw new Error(`not in "groups", so never drawn: ${lost.map((entry) => entry.title).join(", ")}`);
const groups = groupNames.map((group) => `<h2 class="group">${esc(group)}</h2>`
  + spec.sections.filter((section) => section.group === group).map(sectionHtml).join("")
  + grouped.filter((shot) => shot.group === group).map(shotHtml).join("")).join("");
const tocEntries = groupNames.flatMap((group) => [...spec.sections.filter((section) => section.group === group),
  ...grouped.filter((shot) => shot.group === group)]);
const toc = tocEntries.map((entry) => `<li><a href="#${esc(entry.id)}">${esc(entry.title)}</a></li>`).join("")
  + (loose.length ? `<li><a href="#shots">Screenshots</a></li>` : "") + (spec.renames?.length ? `<li><a href="#names">Names</a></li>` : "")
  + (spec.notShown?.length ? `<li><a href="#not-shown">Not shown</a></li>` : "");
// What a still page cannot show (a behaviour, a screen reader's words): listed, so a reviewer knows it was not forgotten.
const notShownHtml = spec.notShown?.length ? `<h2 class="group" id="not-shown">Not shown here</h2><section class="change"><p class="change__what">Changes a still page cannot show, and how to check each.</p>
    <div class="scroller"><table><thead><tr><th>Change</th><th>How to check it</th></tr></thead><tbody>
    ${spec.notShown.map(([change, how]) => `<tr><td>${esc(change)}</td><td>${esc(how)}</td></tr>`).join("")}
    </tbody></table></div></section>` : "";
const shotsHtml = loose.length ? `<h2 class="group" id="shots">Screenshots</h2><p class="change__what">${esc(spec.shots.note ?? "")}</p>${loose.map(shotHtml).join("")}` : "";
const namesHtml = spec.renames?.length ? `<h2 class="group" id="names">Names</h2><section class="change"><p class="change__what">Words that changed, in English and Russian.</p>
    <div class="scroller"><table><thead><tr><th>Where</th><th>${esc(labels.before)}</th><th>${esc(labels.after)}</th></tr></thead><tbody>
    ${spec.renames.map(([where, before, after]) => `<tr><td>${esc(where)}</td><td>${esc(before)}</td><td>${esc(after)}</td></tr>`).join("")}
    </tbody></table></div></section>` : "";

// The page itself is published without a doctype: the Artifact tool wraps it in its own skeleton.
const index = `<title>${esc(spec.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="fonts/fonts.css">
<style>
/* A review sheet: a narrow column of words, wide before/after rows under each change. */
:root {
  --bg: #f3f6f4; --panel: #ffffff; --ink: #10241a; --muted: #55675e; --line: #d5ded9;
  --accent: #1f6b45; --before: #8a5a14; --after: #1f6b45;
  --font-display: "Oswald", "Arial Narrow", sans-serif; --font-body: "Golos Text", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0f1a15; --panel: #16241d; --ink: #e4ece7; --muted: #9db0a5; --line: #2a3a32; --accent: #7fd1a3; --before: #e8c26a; --after: #7fd1a3; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0f1a15; --panel: #16241d; --ink: #e4ece7; --muted: #9db0a5; --line: #2a3a32; --accent: #7fd1a3; --before: #e8c26a; --after: #7fd1a3; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 400 15px/1.5 var(--font-body); }
.wrap { display: flex; flex-direction: column; gap: 28px; max-width: 2320px; margin: 0 auto;
  padding-block: 28px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.intro { display: flex; flex-direction: column; gap: 10px; max-width: 68ch; }
h1 { margin: 0; font: 700 34px/1.1 var(--font-display); letter-spacing: .01em; text-wrap: balance; }
h2.group { margin: 12px 0 0; font: 600 13px/1 var(--font-body); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
h3 { margin: 0; font: 600 22px/1.2 var(--font-display); text-wrap: balance; }
p { margin: 0; }
.muted { color: var(--muted); }
code { font: 500 13px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
  padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.seg button { min-height: 36px; padding: 0 14px; border: 0; background: none; color: var(--ink); font: 600 14px/1 var(--font-body); cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--panel); }
.seg button:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
a { color: var(--accent); }
.change { display: flex; flex-direction: column; gap: 12px; padding-top: 18px; border-top: 1px solid var(--line); scroll-margin-top: 80px; }
.change__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; }
.width { color: var(--muted); font: 500 13px/1 var(--font-body); }
.change__what { max-width: 75ch; color: var(--muted); }
.change__list { max-width: 75ch; margin: 0; padding-left: 20px; color: var(--muted); }
.change__list > li + li { margin-top: 6px; }
.change__list strong { color: var(--ink); font-weight: 600; }
.change__list ul { margin: 2px 0 0; padding-left: 18px; }
.part { display: flex; flex-direction: column; gap: 10px; }
.part + .part { margin-top: 18px; padding-top: 18px; border-top: 1px dashed var(--line); }
.part__width { margin: 0; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.pair { display: grid; gap: 16px; }
.pair--phone { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 420px)); }
.pair--phone .scroller { width: max-content; max-width: 100%; }
.pair--shot { grid-template-columns: repeat(auto-fill, minmax(min(100%, 1132px), 1fr)); }
/* A desk pair side by side: each frame lays out at ${DESK}px and is scaled down to its column (script below). */
.pair--desk { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 720px) { .pair--desk { grid-template-columns: minmax(0, 1fr); } }
.pair--desk .scroller { overflow: hidden; }
.pair--desk .frame { transform-origin: 0 0; }
.pane { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; }
.tag { display: inline-block; padding: 3px 10px; border-radius: 999px; font: 600 12px/1.3 var(--font-body); letter-spacing: .04em; }
.tag--before { color: var(--before); border: 1px solid var(--before); }
.tag--after { color: var(--panel); background: var(--after); }
.scroller { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
.frame { display: block; height: 240px; border: 0; }
.frame--phone { width: ${PHONE}px; }
.frame--desk { width: ${DESK}px; }
.scroller img { display: block; max-width: none; width: 100%; }
.pair--shot .scroller img { min-width: 900px; }
.look { max-width: 75ch; padding: 8px 12px; border-left: 3px solid ${MARK}; background: var(--panel); border-radius: 0 8px 8px 0; }
.look__tag { color: ${MARK}; font-weight: 700; margin-right: 4px; }
.pair--crop { grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); }
.crop { position: relative; overflow: hidden; width: 100%; max-width: 100%; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
.crop img { position: absolute; max-width: none; height: auto; }
.cmp { box-sizing: border-box; margin: 0; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
.cmp__title { margin: 0 0 8px; font: 600 13px/1.3 var(--font-body); }
.cmp__panes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
.cmp__pane { display: flex; flex-direction: column; gap: 6px; min-width: 0; color: inherit; text-decoration: none; }
.cmp__pane:hover .crop { border-color: var(--accent); }
.cmp__label { font: 600 11px/1.3 var(--font-body); color: var(--muted); }
.cmp__label--before { color: var(--before); }
.cmp__label--after { color: var(--after); }
.cmp .crop { border-radius: 8px; }
.cmp .crop__hit { border-width: 2px; }
.crop__hit { position: absolute; box-sizing: border-box; border: 3px solid ${MARK}; border-radius: 6px; pointer-events: none; }
table { border-collapse: collapse; min-width: 640px; font-size: 14px; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>
<div class="wrap">
  <header class="intro">
    <h1>${esc(spec.title)}</h1>
    ${(spec.intro ?? []).map((line) => `<p>${line}</p>`).join("\n    ")}
    ${spec.sections?.length ? `<p class="muted">The frames show the app's light or dark mode, switched below; scripts don't run in them, so nothing opens on a press. Desk pairs are scaled to fit side by side. What changed is outlined in pink, and each section says where to look.</p>` : `<p class="muted">What changed is outlined in pink.</p>`}
  </header>
  <nav class="bar" aria-label="Preview controls">
    <span class="seg" role="group" aria-label="App mode in the frames">
      <button type="button" id="mode-light" data-mode="light" aria-pressed="true">App light</button>
      <button type="button" id="mode-dark" data-mode="dark" aria-pressed="false">App dark</button>
    </span>
    <ul class="toc">${toc}</ul>
  </nav>
  ${groups}
  ${shotsHtml}
  ${namesHtml}
  ${notShownHtml}
</div>
<script>
(() => {
  const frames = [...document.querySelectorAll("iframe.frame")];
  let mode = "light";
  // A desk frame keeps its ${DESK}px layout and is scaled to its column; its box takes the scaled height.
  const place = (frame) => {
    const height = Number(frame.dataset.height) || 240;
    frame.style.height = height + "px";
    if (!frame.classList.contains("frame--desk")) return;
    const box = frame.parentElement;
    const scale = Math.min(1, box.clientWidth / ${DESK});
    frame.style.transform = "scale(" + scale + ")";
    box.style.height = Math.ceil(height * scale) + "px";
  };
  addEventListener("message", (event) => {
    const frame = frames.find((item) => item.contentWindow === event.source);
    if (!frame || !event.data || !Number.isFinite(event.data.previewHeight)) return;
    frame.dataset.height = String(Math.max(120, event.data.previewHeight));
    place(frame);
  });
  addEventListener("resize", () => frames.forEach(place));
  const tell = (frame) => { if (frame.contentWindow) frame.contentWindow.postMessage({ previewMode: mode }, "*"); };
  for (const frame of frames) frame.addEventListener("load", () => tell(frame));
  for (const button of document.querySelectorAll(".seg button")) {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      for (const other of document.querySelectorAll(".seg button")) other.setAttribute("aria-pressed", String(other === button));
      frames.forEach(tell);
    });
  }
})();
</script>
`;
fs.writeFileSync(path.join(out, "index.html"), index);

const files = [];
for (const dir of ["frames", "css", "fonts", "shots"]) for (const file of fs.readdirSync(path.join(out, dir))) files.push({ path: `${dir}/${file}` });
fs.writeFileSync(path.join(out, "files.json"), JSON.stringify(files));
let bytes = 0;
for (const { path: file } of files) bytes += fs.statSync(path.join(out, file)).size;
console.log(`${files.length} supporting files, ${(bytes / 1024 / 1024).toFixed(2)} MB, in ${out}`);
if (missing.length) console.log(`missing fragments (drawn empty): ${missing.join(", ")}`);

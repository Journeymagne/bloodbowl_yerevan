// Takes one side's screenshots of the running app and measures where each change stands on them.
//
//   node .claude/skills/ui-preview/shots.mjs <app url> <states.mjs> <out dir> <before|after>
//
// <states.mjs> exports STATES: [{ id, hash, width, height, locale?, guest?, click?, align?, alignY?, marks? }]
// - `click`: a selector pressed after the hash is opened (a chip that opens a sheet, a row that fills the panel).
// - `align`: { sel } or { before, after } — the page is scrolled so that element stands `alignY` (200) from the top on
//   both sides: a box is drawn at the same place on both pictures, so a change below rows that moved needs it.
// - `marks`: [{ name, sel } or { name, before, after }] — selector lists per side; each mark's box is the union of what
//   they find. Writes <out dir>/<id>.png and <out dir>/rects.json ({ [id]: [{ name, box }] }).
// Signs in as the mock coach (localStorage "gata-league-auth-token" = "mock") unless `guest`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connect, launchChrome, openPage, sleep } from "../../../scripts/screenshots/cdp.mjs";

const [base, statesFile, outDir, side] = process.argv.slice(2);
if (!base || !statesFile || !outDir || !["before", "after"].includes(side)) {
  throw new Error("usage: node shots.mjs <app url> <states.mjs> <out dir> <before|after>");
}
const { STATES } = await import(pathToFileURL(path.resolve(statesFile)).href);
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

fs.mkdirSync(outDir, { recursive: true });
const rects = {};
const chrome = await launchChrome(CHROME);
try {
  const connection = await connect(chrome.wsUrl);
  for (const state of STATES) {
    const page = await openPage(connection, { width: state.width, height: state.height, mobile: state.width <= 900, colorScheme: "light" });
    await page.navigate(`${base}/`);
    const auth = state.guest ? `localStorage.removeItem("gata-league-auth-token");` : `localStorage.setItem("gata-league-auth-token", "mock");`;
    const locale = state.locale ? `localStorage.setItem("gata-league-locale", ${JSON.stringify(state.locale)});` : `localStorage.removeItem("gata-league-locale");`;
    await page.evaluate(`${auth} ${locale} true`);
    await page.navigate(`${base}/?signed`);
    await sleep(1500);
    // A hash change fires no load event: it is set, then waited for.
    await page.evaluate(`location.hash = ${JSON.stringify(state.hash)}; true`);
    await sleep(2200);
    if (state.click) {
      const said = await page.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(state.click)}); if (!node) return "missing"; node.click(); return "clicked"; })()`);
      if (said !== "clicked") console.log(`${state.id}: click ${said}`);
      await sleep(1200);
    }
    if (state.align) {
      const selector = state.align[side] ?? state.align.sel;
      const alignY = state.alignY ?? 200;
      const said = await page.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return "missing";
        window.scrollBy(0, node.getBoundingClientRect().top - ${alignY}); return "aligned " + Math.round(node.getBoundingClientRect().top); })()`);
      if (!said.startsWith("aligned")) console.log(`${state.id}: align ${said}`);
      else if (said !== `aligned ${alignY}`) console.log(`${state.id}: ${said}, not ${alignY} — near the page's end; set a larger alignY`);
      await sleep(400);
    }
    const marks = (state.marks ?? []).map((mark) => ({ name: mark.name, selectors: mark[side] ?? mark.sel ?? [] }));
    const found = await page.evaluate(`(() => {
      const marks = ${JSON.stringify(marks)};
      return marks.map(({ name, selectors }) => {
        const boxes = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).map((node) => node.getBoundingClientRect()).filter((r) => r.width && r.height);
        if (!boxes.length) return { name, box: null };
        const x = Math.min(...boxes.map((r) => r.left)), y = Math.min(...boxes.map((r) => r.top));
        const right = Math.max(...boxes.map((r) => r.right)), bottom = Math.max(...boxes.map((r) => r.bottom));
        return { name, box: { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y) } };
      });
    })()`);
    rects[state.id] = found;
    for (const { name, box } of found) if (!box) console.log(`${state.id}: ${name} not found on ${side}`);
    fs.writeFileSync(path.join(outDir, `${state.id}.png`), await page.screenshot());
    await page.close();
  }
  connection.close();
} finally {
  await chrome.close();
}
fs.writeFileSync(path.join(outDir, "rects.json"), JSON.stringify(rects, null, 2));
console.log(`${side}: ${STATES.length} states in ${outDir}`);

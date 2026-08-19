#!/usr/bin/env node
/**
 * Optional UI smoke test: drives a real browser against a running dev server.
 *
 *   npm run dev            # in one terminal (serves on :5173)
 *   npx playwright install chromium   # once, if you have not already
 *   node scripts/browser-check.mjs
 *
 * Playwright is deliberately NOT a dependency of this project — the script
 * loads it if it happens to be available and explains how to get it if not.
 * `npm test` does not run this.
 *
 * Override the target with BASE, e.g. BASE=http://localhost:3002.
 */
const base = (process.env.BASE || "http://localhost:5173").replace(/\/$/, "");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`,");
  console.error("or skip this check — it is optional.");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console error: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
page.on("requestfailed", (request) => problems.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));

let failed = 0;
async function check(name, run) {
  try {
    const detail = await run();
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}: ${error.message.split("\n")[0]}`);
  }
}

console.log(`Browser check against ${base}\n`);

await check("home screen renders", async () => {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".overview-grid .card", { timeout: 15000 });
  return `${await page.locator(".overview-grid .card").count()} overview cards`;
});

await check("teams list", async () => {
  await page.goto(`${base}/#/teams`, { waitUntil: "networkidle" });
  await page.waitForSelector(".card-grid .card", { timeout: 15000 });
  const count = await page.locator(".card-grid .card").count();
  if (count !== 37) throw new Error(`expected 37 team cards, found ${count}`);
  return `${count} teams`;
});

await check("team detail", async () => {
  await page.goto(`${base}/#/teams/amazon`, { waitUntil: "networkidle" });
  await page.waitForSelector("h1", { timeout: 15000 });
  return (await page.locator("h1").first().textContent())?.trim();
});

await check("builder hires exactly one player per click", async () => {
  await page.goto(`${base}/#/builder`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-add-row]", { timeout: 15000 });
  const unique = () => page.evaluate(() =>
    new Set([...document.querySelectorAll("[data-remove-player]")].map((node) => node.dataset.removePlayer)).size);
  const before = await unique();
  const summary = () => page.locator(".builder-info-panel .stat-list, .builder-summary .stat-list").first().innerText();
  const costBefore = await summary();
  await page.locator("[data-add-row]").first().click();
  await page.waitForTimeout(300);
  const after = await unique();
  if (after !== before + 1) throw new Error(`expected ${before + 1} players, found ${after}`);
  if ((await summary()) === costBefore) throw new Error("cost did not change");
  return `${before} -> ${after} players`;
});

await check("locale switch", async () => {
  await page.goto(`${base}/#/my-teams`, { waitUntil: "networkidle" });
  const before = await page.evaluate(() => document.documentElement.lang);
  const textBefore = (await page.locator("#app-view").innerText()).slice(0, 120);
  await page.locator("#lang-toggle").click();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => document.documentElement.lang);
  const textAfter = (await page.locator("#app-view").innerText()).slice(0, 120);
  if (before === after) throw new Error(`html[lang] stayed ${before}`);
  if (textBefore === textAfter) throw new Error("screen text did not change");
  return `${before} -> ${after}`;
});

await check("theme switch", async () => {
  await page.selectOption("#theme-select", "light-parchment");
  await page.waitForTimeout(200);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== "light-parchment") throw new Error(`theme is ${theme}`);
  return theme;
});

for (const pathname of ["/.env", "/package.json", "/server/init.sql"]) {
  await check(`${pathname} is not served`, async () => {
    const response = await page.request.get(`${base}${pathname}`);
    if (response.status() !== 404) throw new Error(`status ${response.status()}`);
    return "404";
  });
}

await browser.close();

if (problems.length) {
  console.error(`\nBrowser reported ${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 20)) console.error(`  - ${problem}`);
} else {
  console.log("\nNo console or network errors.");
}

const exitCode = failed || problems.length ? 1 : 0;
console.log(exitCode ? "\nBrowser check FAILED." : "\nBrowser check passed.");
process.exit(exitCode);

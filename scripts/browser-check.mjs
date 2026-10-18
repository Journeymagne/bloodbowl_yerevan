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
  await page.goto(`${base}/#/ref/teams`, { waitUntil: "networkidle" });
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

await check("a guest's builder asks to sign in", async () => {
  await page.goto(`${base}/#/teams/new`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-auth-form]", { timeout: 15000 });
  const hash = await page.evaluate(() => location.hash);
  if (hash !== "#/login") throw new Error(`expected #/login, found ${hash}`);
  return hash;
});

await check("locale switch", async () => {
  await page.goto(`${base}/#/ref/teams`, { waitUntil: "networkidle" });
  const before = await page.evaluate(() => document.documentElement.lang);
  const textBefore = (await page.locator("#app-view").innerText()).slice(0, 120);
  // The language buttons sit at the foot of the SideNav (the desktop frame); the one not pressed is the other language.
  await page.locator('#side-nav [data-locale-switch][aria-pressed="false"]').click();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => document.documentElement.lang);
  const textAfter = (await page.locator("#app-view").innerText()).slice(0, 120);
  if (before === after) throw new Error(`html[lang] stayed ${before}`);
  if (textBefore === textAfter) throw new Error("screen text did not change");
  return `${before} -> ${after}`;
});

await check("theme switch", async () => {
  await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
  await page.locator('[data-seg-group="mode"] [data-seg-value="light"]').click();
  await page.locator('[data-palette-key="parchment"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.mode === "light" && document.documentElement.dataset.palette === "parchment", null, { timeout: 5000 });
  const { mode, palette } = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  return `${mode}/${palette}`;
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

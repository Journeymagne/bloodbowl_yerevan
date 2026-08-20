#!/usr/bin/env node
/**
 * Drive the saved roster editor in a real browser against scripts/mock-api.mjs.
 *
 *   node scripts/mock-api.mjs &
 *   node scripts/browser-check-roster.mjs
 *
 * Covers what the plain browser check cannot reach without a login: rendering
 * the editor, autosave, hiring, SPP on both layouts, and that the roster blob
 * sent to the server carries no retired keys.
 *
 * Playwright is optional and not a dependency of this project:
 *   npm i -D playwright && npx playwright install chromium
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed — this check is optional. See the comment at the top of this file.");
  process.exit(2);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savesPath = path.join(rootDir, ".codex_tmp", "mock-saves.json");
const base = process.env.MOCK_BASE || "http://localhost:5174";
const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

let failed = 0;
const check = async (name, fn) => {
  try { const d = await fn(); console.log(`  ok   ${name}${d ? ` — ${d}` : ""}`); }
  catch (e) { failed += 1; console.error(`  FAIL ${name}: ${e.message.split("\n")[0]}`); }
};

// seed the auth token the app expects in localStorage
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("gata-league-auth-token", "mock"));

await check("my teams list opens", async () => {
  await page.goto(`${base}/#/my-teams`, { waitUntil: "networkidle" });
  await page.waitForSelector("a[href*='#/my-teams/t1'], [data-open-team], td, .card", { timeout: 10000 });
  return (await page.locator("#app-view").innerText()).split("\n").slice(0, 2).join(" / ");
});

await check("saved roster editor renders", async () => {
  await page.goto(`${base}/#/my-teams/t1`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-roster-player]", { timeout: 10000 });
  const players = await page.evaluate(() =>
    new Set([...document.querySelectorAll("[data-roster-player]")].map((n) => n.dataset.rosterPlayer)).size);
  if (players !== 2) throw new Error(`expected 2 players, found ${players}`);
  return `${players} players`;
});

await check("summary shows cost and SPP", async () => {
  const summary = await page.locator(".saved-roster-summary-panel, .builder-summary").first().innerText();
  if (!/SPP/.test(summary)) throw new Error("no SPP in the summary");
  return summary.replace(/\s+/g, " ").slice(0, 90);
});

await check("editing a player name autosaves", async () => {
  const input = page.locator("[data-saved-player-name]").first();
  await input.fill("Переименованная");
  await page.waitForTimeout(1200);
  const saved = JSON.parse(await fs.readFile(savesPath, "utf8"));
  const last = saved.at(-1);
  const names = (last.roster.players ?? []).map((p) => p.name);
  if (!names.includes("Переименованная")) throw new Error(`the PATCH sent: ${JSON.stringify(names)}`);
  return `PATCH #${saved.length}, ${last.roster.players.length} players`;
});

await check("the saved blob carries no playerEdits or slots", async () => {
  const saved = JSON.parse(await fs.readFile(savesPath, "utf8"));
  const last = saved.at(-1);
  const keys = Object.keys(last.roster);
  for (const dead of ["playerEdits", "slots"]) {
    if (keys.includes(dead)) throw new Error(`key ${dead} is still written`);
  }
  return keys.join(", ");
});

await check("desktop SPP: typing a number updates the summary", async () => {
  const before = await page.locator("[data-total-spp-display]").first().innerText();
  const input = page.locator("[data-saved-player-spp]").first();
  await input.fill("5");
  await page.waitForTimeout(900);
  const after = await page.locator("[data-total-spp-display]").first().innerText();
  if (before === after) throw new Error(`SPP did not change: ${before}`);
  return `${before} -> ${after}`;
});

await check("mobile SPP: the +1 buttons work", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".saved-roster-mobile-list [data-roster-player]", { timeout: 10000 });
  const before = await page.locator("[data-total-spp-display]").first().innerText();
  await page.locator(".mobile-spp-action").first().click();
  await page.waitForTimeout(900);
  const after = await page.locator("[data-total-spp-display]").first().innerText();
  if (before === after) throw new Error(`SPP did not change: ${before}`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-roster-player]", { timeout: 10000 });
  return `${before} -> ${after}`;
});

await check("hiring a player", async () => {
  const count = () => page.evaluate(() =>
    new Set([...document.querySelectorAll("[data-roster-player]")].map((n) => n.dataset.rosterPlayer)).size);
  const before = await count();
  await page.locator("[data-add-saved-row]").first().click();
  await page.waitForTimeout(800);
  const after = await count();
  if (after !== before + 1) throw new Error(`was ${before}, now ${after}`);
  return `${before} -> ${after}`;
});

await check("a reload keeps the edits", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-roster-player]", { timeout: 10000 });
  // input values are not part of innerText — read them directly
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("[data-saved-player-name]")].map((node) => node.value));
  if (!names.includes("Переименованная")) throw new Error(`fields contain: ${JSON.stringify(names)}`);
  return `${names.length} name fields, the edit survived`;
});

await browser.close();
console.log(problems.length ? `\nConsole errors (${problems.length}):\n  ${problems.slice(0,5).join("\n  ")}` : "\nNo console errors.");
process.exit(failed || problems.length ? 1 : 0);

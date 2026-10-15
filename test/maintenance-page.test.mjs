import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PALETTE, LEGACY_THEME_PALETTE, PALETTE_KEYS, paletteFor } from "../public/maintenance/palettes.mjs";
import { STRINGS, describeMaintenance, flagFromHealth, formatClock, lastCheckText, pickLocale } from "../public/maintenance/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFile(path.join(root, file), "utf8");

test("no stored choice follows the system", () => {
  assert.deepEqual(paletteFor({ palette: null, legacyTheme: null, prefersDark: false }), { mode: "light", key: DEFAULT_PALETTE.light });
  assert.deepEqual(paletteFor({ palette: null, legacyTheme: null, prefersDark: true }), { mode: "dark", key: DEFAULT_PALETTE.dark });
});

test("every 2.x theme lands on a 3.0 palette of the same mode", () => {
  for (const [theme, [mode, key]] of Object.entries(LEGACY_THEME_PALETTE)) {
    assert.ok(PALETTE_KEYS[mode].includes(key), theme);
    assert.equal(theme.startsWith(mode), true, theme);
    assert.deepEqual(paletteFor({ palette: null, legacyTheme: theme, prefersDark: mode === "light" }), { mode, key });
  }
  assert.equal(Object.keys(LEGACY_THEME_PALETTE).length, 6);
});

test("a 3.0 choice wins over the 2.x theme", () => {
  const palette = JSON.stringify({ mode: "dark", light: "ice", dark: "embers" });
  assert.deepEqual(paletteFor({ palette, legacyTheme: "light-parchment", prefersDark: false }), { mode: "dark", key: "embers" });
  const system = JSON.stringify({ mode: "system", light: "ice", dark: "abyss" });
  assert.deepEqual(paletteFor({ palette: system, legacyTheme: null, prefersDark: false }), { mode: "light", key: "ice" });
  assert.deepEqual(paletteFor({ palette: system, legacyTheme: null, prefersDark: true }), { mode: "dark", key: "abyss" });
});

test("junk in storage falls back instead of breaking the page", () => {
  assert.deepEqual(paletteFor({ palette: "{oops", legacyTheme: "dark-dugout", prefersDark: false }), { mode: "dark", key: "embers" });
  assert.deepEqual(paletteFor({ palette: JSON.stringify({ mode: "dark", dark: "neon" }), legacyTheme: null, prefersDark: false }), { mode: "dark", key: DEFAULT_PALETTE.dark });
  assert.deepEqual(paletteFor({ palette: null, legacyTheme: "sepia", prefersDark: false }), { mode: "light", key: DEFAULT_PALETTE.light });
});

test("the stylesheet defines every palette", async () => {
  const css = await read("public/maintenance/maintenance.css");
  for (const key of [...PALETTE_KEYS.light, ...PALETTE_KEYS.dark]) {
    assert.match(css, new RegExp(`\\[data-palette="${key}"\\]`), key);
  }
});

test("both languages have the same strings", () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.ru).sort());
});

test("the stored locale wins, then the browser's", () => {
  assert.equal(pickLocale("en", "ru-RU"), "en");
  assert.equal(pickLocale(null, "ru-RU"), "ru");
  assert.equal(pickLocale("de", "hy-AM"), "en");
});

test("times are shown on Yerevan's clock", () => {
  assert.equal(formatClock(Date.parse("2026-11-02T15:00:00Z"), "ru"), "19:00");
});

test("planned work shows its window, progress and what is left", () => {
  const flag = { kind: "planned", startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T16:00:00.000Z" };
  const view = describeMaintenance(flag, Date.parse("2026-11-02T15:30:00Z"), "ru");
  assert.equal(view.state, "planned");
  assert.equal(view.chip, STRINGS.ru.plannedChip);
  assert.deepEqual(view.window, { startsAt: "19:00", endsAt: "≈ 20:00" });
  assert.equal(view.progress, 50);
  assert.match(view.meta, /30/);
});

test("planned work past its end says it is almost done", () => {
  const flag = { kind: "planned", startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T16:00:00.000Z" };
  const view = describeMaintenance(flag, Date.parse("2026-11-02T16:10:00Z"), "en");
  assert.equal(view.progress, 100);
  assert.equal(view.meta, STRINGS.en.overdue);
});

test("an outage says since when, and nothing about an end", () => {
  const view = describeMaintenance({ kind: "unplanned", startsAt: "2026-11-02T10:12:00.000Z", endsAt: null }, Date.parse("2026-11-02T11:00:00Z"), "ru");
  assert.equal(view.state, "unplanned");
  assert.equal(view.window, null);
  assert.equal(view.progress, null);
  assert.match(view.meta, /14:12/);
  const unknown = describeMaintenance({ kind: "unplanned", startsAt: null, endsAt: null }, 0, "en");
  assert.equal(unknown.meta, STRINGS.en.sinceUnknown);
});

test("no flag means done", () => {
  const view = describeMaintenance(null, 0, "en");
  assert.equal(view.state, "done");
  assert.equal(view.title, STRINGS.en.doneTitle);
});

test("a check says what it found: no answer, still down, or back", () => {
  const now = Date.parse("2026-11-02T15:00:00Z");
  const flag = { kind: "planned", startsAt: null, endsAt: null };
  assert.equal(lastCheckText(undefined, now, "ru"), "Не удалось связаться с сайтом · 19:00");
  assert.equal(lastCheckText(undefined, now, "en"), "Couldn't reach the site · 19:00");
  assert.equal(lastCheckText(flag, now, "ru"), "Ещё не готово · проверили в 19:00");
  assert.equal(lastCheckText(flag, now, "en"), "Not ready yet · checked at 19:00");
  assert.equal(lastCheckText(null, now, "ru"), "");
  assert.equal(lastCheckText(null, now, "en"), "");
});

test("only a health reply that says so counts as done", () => {
  const flag = { kind: "unplanned", startsAt: null, endsAt: null };
  assert.equal(flagFromHealth({ ok: true, maintenance: null }), null);
  assert.deepEqual(flagFromHealth({ ok: true, maintenance: flag }), flag);
  // Anything else is a proxy's error page or a different server: unknown, not done.
  for (const body of [{ ok: true }, {}, null, "ok", 42, []]) assert.equal(flagFromHealth(body), undefined, JSON.stringify(body));
});

test("the page only names strings and files that exist", async () => {
  const html = await read("public/maintenance/index.html");
  for (const [, key] of html.matchAll(/data-text="([^"]+)"/g)) assert.ok(key in STRINGS.ru, key);
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    if (href === "/") continue;
    await fs.access(path.join(root, href.replace(/^\//, "")));
  }
  assert.doesNotMatch(html, /style="/);
  assert.doesNotMatch(html, /<script>(?!<\/script>)/);
});

test("every slot the script fills exists in the page", async () => {
  const script = await read("public/maintenance/maintenance.js");
  const html = await read("public/maintenance/index.html");
  const used = new Set([...script.matchAll(/slot\("(\w+)"\)/g)].map(([, name]) => name));
  const present = new Set([...html.matchAll(/data-slot="(\w+)"/g)].map(([, name]) => name));
  assert.ok(used.size > 0);
  for (const name of used) assert.ok(present.has(name), name);
});

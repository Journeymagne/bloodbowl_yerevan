import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const fontsCss = read("assets/fonts/ui/fonts.css");

test("the app links the 3.0 faces before its own stylesheet", () => {
  const fonts = html.indexOf('<link rel="stylesheet" href="assets/fonts/ui/fonts.css?v=');
  assert.ok(fonts > 0, "fonts.css is linked, versioned like the other assets");
  assert.ok(fonts < html.indexOf('href="src/styles.css?v='));
});

test("the preloads are the faces the first screen paints with, exactly as fonts.css asks for them", () => {
  const tags = [...html.matchAll(/<link rel="preload" as="font"[^>]*>/g)].map(([tag]) => tag);
  const hrefs = tags.map((tag) => /href="([^"]+)"/.exec(tag)[1]);
  assert.deepEqual(hrefs.sort(), [
    "assets/fonts/ui/golos-text-cyrillic-400-normal.woff2",
    "assets/fonts/ui/golos-text-cyrillic-600-normal.woff2",
    "assets/fonts/ui/golos-text-latin-400-normal.woff2",
    "assets/fonts/ui/golos-text-latin-600-normal.woff2",
    "assets/fonts/ui/oswald-cyrillic-600-normal.woff2",
    "assets/fonts/ui/oswald-cyrillic-700-normal.woff2",
    "assets/fonts/ui/oswald-latin-600-normal.woff2",
    "assets/fonts/ui/oswald-latin-700-normal.woff2",
  ]);
  for (const tag of tags) {
    assert.match(tag, /type="font\/woff2"/, tag);
    assert.match(tag, /\scrossorigin[\s>]/, `${tag}: a font preload without crossorigin is fetched twice`);
  }
  for (const href of hrefs) {
    assert.ok(existsSync(path.join(root, href)), href);
    assert.ok(fontsCss.includes(`url(${path.basename(href)})`), `${href} is not what fonts.css requests`);
  }
});

test("Comfortaa and Nunito are no longer preloaded", () => {
  assert.doesNotMatch(html, /comfortaa|nunito/i);
});

// The 2.x faces went with the 2.x tables (stage 13): every sheet of the app and of the maintenance page names only the two.
test("no font but Golos Text and Oswald is declared", () => {
  const sheets = [
    ...readdirSync(path.join(root, "src"), { recursive: true }).filter((name) => name.endsWith(".css")).map((name) => `src/${name}`),
    ...readdirSync(path.join(root, "public/maintenance")).filter((name) => name.endsWith(".css")).map((name) => `public/maintenance/${name}`),
    "assets/fonts/ui/fonts.css",
  ];
  for (const sheet of sheets) {
    const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, /comfortaa|nunito/i, sheet);
    for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      assert.match(body, /font-family:\s*["']?(Golos Text|Oswald)["']?\s*;/, `${sheet}: ${body.trim()}`);
    }
  }
  assert.deepEqual(readdirSync(path.join(root, "assets/fonts")), ["ui"], "the 2.x faces' folders are gone");
});

// 883 KB that nothing draws (spec :546; stage 11's hand-off): the maintenance page draws the 96px one.
test("the full-size 2.x logo no longer ships", () => {
  assert.equal(existsSync(path.join(root, "assets/brand/gata-league-logo.png")), false);
  assert.ok(existsSync(path.join(root, "assets/brand/gata-league-logo-96.png")));
});

test("fonts.css declares the two families the tokens name, and the licences ship with them", () => {
  const families = new Set([...fontsCss.matchAll(/font-family:\s*'([^']+)'/g)].map(([, family]) => family));
  assert.deepEqual([...families].sort(), ["Golos Text", "Oswald"]);
  for (const licence of ["OFL-GolosText.txt", "OFL-Oswald.txt"]) assert.ok(existsSync(path.join(root, "assets/fonts/ui", licence)), licence);
});

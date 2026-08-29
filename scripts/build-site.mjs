import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

/**
 * Fold src/styles.css' @import lines into one stylesheet.
 *
 * The source is eight files so a person can find things in it; the site should
 * still fetch one. Inlining also keeps the parts covered by the version on the
 * index's link - an @import would ask for styles/roster.css with no ?v= on it
 * and get a day-old copy after a deploy.
 */
async function inlineCssImports(file) {
  const source = await fs.readFile(file, "utf8");
  const parts = [];
  for (const match of source.matchAll(/@import url\("([^"]+)"\);/g)) {
    parts.push(await fs.readFile(path.join(path.dirname(file), match[1]), "utf8"));
  }
  if (!parts.length) return source;
  return parts.join(String.fromCharCode(10));
}

function minifyCss(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>+~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

/**
 * One cache-busting token for every asset, derived from the files it protects.
 * index.html is the only place a version appears; src/app.js reads its own
 * `?v=` back off import.meta.url, so the data and i18n fetches automatically
 * match whatever index.html asked for.
 */
async function assetVersion() {
  const hash = crypto.createHash("sha256");
  // Every file the browser runs or reads, in a fixed order. Hashing only
  // app.js used to leave the token unchanged when any of the other 118 modules
  // changed, and the token is what tells a returning browser to fetch them
  // again. The reference data is in here for the same reason: app.js passes
  // this token to its data and dictionary fetches, so a rules change that
  // moved no code would otherwise be served from a day-old cache.
  const files = [
    path.join(rootDir, "index.html"),
    ...(await sourceFiles(path.join(rootDir, "src"))),
    ...["data.en.json", "data.ru.json"].map((name) => path.join(rootDir, "public", name)),
  ];
  for (const file of files.sort()) hash.update(await fs.readFile(file));
  return `gata-${hash.digest("hex").slice(0, 10)}`;
}

/** Every script and stylesheet under a directory, recursively. */
async function sourceFiles(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (/\.(mjs|js|css)$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * Put the version on every import inside the copied modules.
 *
 * index.html versions src/app.js, but app.js imports src/core/*.mjs with
 * plain relative paths, and those URLs do not change between releases. A
 * browser holding yesterday's copy of a module and today's app.js runs a
 * mixed graph — the bug that made changes look like they had not deployed.
 */
async function stampImports(dir, version) {
  for (const file of await sourceFiles(dir)) {
    if (file.endsWith(".css")) continue;
    const source = await fs.readFile(file, "utf8");
    const stamped = source.replace(
      /(from\s*")(\.[^"]+\.(?:mjs|js))(")/g,
      (whole, before, specifier, after) => `${before}${specifier}?v=${version}${after}`,
    );
    if (stamped !== source) await fs.writeFile(file, stamped);
  }
}

/** Rewrite every `?v=...` in index.html, failing loudly if the markup moved. */
function stampVersion(html, version) {
  const pattern = /(\b(?:src|href)="[^"]+\?v=)[^"]*(")/g;
  const stamped = html.replace(pattern, `$1${version}$2`);
  const count = (html.match(pattern) ?? []).length;
  if (count < 2) {
    throw new Error(
      `build-site: expected at least 2 versioned asset references in index.html, found ${count}. `
      + "Update stampVersion() if the markup changed.",
    );
  }
  return stamped;
}

/**
 * The offline preview inlines the reference data so no fetch is needed.
 *
 * Inline means a <script> block, which the deployed site refuses since step
 * 17.5 — its Content-Security-Policy allows no inline script at all. So this
 * file is for a local static server, not for the deployed host: opened there
 * it would load the page and no data.
 */
function buildLocalPreview(html, enDataJson, ruDataJson) {
  const scriptPattern = /<script type="module" src="(src\/app\.js[^"]*)"><\/script>/;
  const match = html.match(scriptPattern);
  if (!match) {
    throw new Error("build-site: could not find the module script tag in index.html; update buildLocalPreview().");
  }
  const inlineData = `<script>window.__REFERENCE_DATA__ = { en: ${enDataJson}, ru: ${ruDataJson} };</script>`;
  // Stays type="module" — src/app.js imports its domain modules, so a classic
  // script would fail. That means this file has to be *served* (npm run dev,
  // or any static server pointed at dist/), not opened straight off disk.
  return html.replace(scriptPattern, `${inlineData}\n    <script type="module" src="${match[1]}"></script>`);
}

await fs.mkdir(distDir, { recursive: true });

const version = await assetVersion();
const indexHtml = stampVersion(await fs.readFile(path.join(rootDir, "index.html"), "utf8"), version);
await fs.writeFile(path.join(distDir, "index.html"), indexHtml);
await copyDir(path.join(rootDir, "src"), path.join(distDir, "src"));
await stampImports(path.join(distDir, "src"), version);
await copyDir(path.join(rootDir, "public"), path.join(distDir, "public"));
await copyDir(path.join(rootDir, "assets"), path.join(distDir, "assets"));
const stylesPath = path.join(distDir, "src", "styles.css");
await fs.writeFile(stylesPath, minifyCss(await inlineCssImports(stylesPath)));

const enDataJson = (await fs.readFile(path.join(rootDir, "public", "data.en.json"), "utf8"))
  .replace(/</g, "\\u003c");
const ruDataJson = (await fs.readFile(path.join(rootDir, "public", "data.ru.json"), "utf8"))
  .replace(/</g, "\\u003c");
await fs.writeFile(
  path.join(distDir, "local-preview.html"),
  buildLocalPreview(indexHtml, enDataJson, ruDataJson),
);

console.log(`Built static site into dist (asset version ${version})`);

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { cacheControlForStatic } from "../server/http/static.mjs";

// The function only looks at the URL's path and query and at the extension of
// the file it resolved to, so the file need not exist.
const cacheFor = (target) => {
  const url = new URL(target, "http://localhost");
  return cacheControlForStatic(url, path.join("root", url.pathname));
};

test("the maintenance page's files are revalidated on every load", () => {
  // They carry no ?v=, so a day's max-age would keep yesterday's script and
  // styles in a browser that saw the page, after a deploy changed them.
  for (const file of ["maintenance.js", "state.mjs", "palettes.mjs", "maintenance.css", "index.html"]) {
    assert.equal(cacheFor(`/public/maintenance/${file}`), "no-cache", file);
  }
});

test("the rest keeps the caching it had", () => {
  assert.equal(cacheFor("/"), "no-cache");
  assert.equal(cacheFor("/index.html"), "no-cache");
  assert.equal(cacheFor("/src/app.js?v=2.1.0"), "public, max-age=31536000, immutable");
  assert.equal(cacheFor("/assets/fonts/ui/fonts.css"), "public, max-age=31536000, immutable");
  assert.equal(cacheFor("/public/data.en.json"), "public, max-age=3600, stale-while-revalidate=86400");
  assert.equal(cacheFor("/src/i18n/ru.json"), "public, max-age=3600, stale-while-revalidate=86400");
  assert.equal(cacheFor("/src/app.js"), "public, max-age=86400");
});

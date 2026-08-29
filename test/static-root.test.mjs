import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveStaticPath } from "../server/http/static-path.mjs";

// The module under test picks its root once, at import, from the real
// filesystem; what matters for a test is the consequence — which file a
// request lands on once a root has been chosen.
const root = path.resolve("srv", "bloodbowl");
const dist = path.join(root, "dist");

test("a module request lands in dist when the site is served from there", () => {
  const fromDist = resolveStaticPath("/src/core/router.mjs", dist);
  assert.equal(fromDist, path.join(dist, "src", "core", "router.mjs"));

  // The same request against the repository root reaches the unstamped copy,
  // which is what production was serving: imports with no ?v= on them, cached
  // for a day. Kept as a test so the difference stays visible.
  const fromRoot = resolveStaticPath("/src/core/router.mjs", root);
  assert.equal(fromRoot, path.join(root, "src", "core", "router.mjs"));
  assert.notEqual(fromDist, fromRoot);
});

test("the index and the data files come from the same root", () => {
  assert.equal(resolveStaticPath("/", dist), path.join(dist, "index.html"));
  assert.equal(resolveStaticPath("/public/data.ru.json", dist), path.join(dist, "public", "data.ru.json"));
});

test("the whitelist still refuses what it always refused", () => {
  for (const pathname of ["/.env", "/server/server.mjs", "/../.env", "/package.json", "/content/Gata/Teams/Amazon.md"]) {
    assert.equal(resolveStaticPath(pathname, dist), null, `${pathname} must not be servable`);
  }
});

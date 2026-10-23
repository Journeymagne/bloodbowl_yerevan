import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { pruneStale } from "../scripts/lib/prune-dir.mjs";

/*
 * The build empties dist/ of what it no longer writes (review of stage 13; 09c's hand-off «очистка dist/ при сборке»):
 * a 2.x stylesheet, module, font or logo deleted from the repository is not served from dist/ after day X's build. It
 * removes them only after the new files are in place, never dist/ as a whole before building (a deploy that rebuilds
 * while the server runs would answer 404s meanwhile).
 */

test("a file the build did not write is gone after it, with the folders it leaves empty; what it wrote stays", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gata-prune-"));
  try {
    const file = (name, text = name) => {
      const full = path.join(dir, ...name.split("/"));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
      return full;
    };
    const kept = new Set([file("index.html"), file("src/app.js"), file("src/ui/base.css"), file("assets/fonts/ui/oswald.woff2")]);
    file("src/styles/legacy-aliases.css");
    file("src/components/dialog.mjs");
    file("assets/fonts/comfortaa/comfortaa.woff2");
    file("assets/brand/gata-league-logo.png");
    file("src/styles/tokens.css", "kept by the build");
    kept.add(path.join(dir, "src", "styles", "tokens.css"));
    const removed = await pruneStale(dir, kept);
    assert.deepEqual(removed, ["assets/brand/gata-league-logo.png", "assets/fonts/comfortaa/comfortaa.woff2", "src/components/dialog.mjs", "src/styles/legacy-aliases.css"]);
    for (const gone of ["src/components", "assets/fonts/comfortaa", "assets/brand"]) assert.equal(existsSync(path.join(dir, gone)), false, `${gone}: emptied, removed`);
    for (const name of kept) assert.ok(existsSync(name), name);
    assert.equal(readFileSync(path.join(dir, "src", "styles", "tokens.css"), "utf8"), "kept by the build");
    assert.ok(existsSync(dir), "never the built folder itself");
    assert.deepEqual(await pruneStale(dir, kept), [], "a second run finds nothing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the site's build names every file it writes and prunes dist/ last, after the last write", () => {
  const build = readFileSync(new URL("../scripts/build-site.mjs", import.meta.url), "utf8");
  assert.match(build, /import \{ pruneStale \} from "\.\/lib\/prune-dir\.mjs";/);
  const prune = build.indexOf("await pruneStale(distDir, written)");
  assert.ok(prune > 0, "the build prunes dist/");
  const lastWrite = Math.max(...[...build.matchAll(/await (?:writeBuilt|copyDir|stampImports)\(/g)].map((match) => match.index));
  assert.ok(prune > lastWrite, "after every write");
  assert.doesNotMatch(build, /fs\.rm\(distDir|rmdir\(distDir|rm -rf/, "dist/ is never emptied before the build");
  // Every file the build puts in dist/ goes through one of the two that remember it.
  assert.equal([...build.matchAll(/fs\.writeFile\(/g)].length, 2, "writeBuilt's own and stampImports' rewrite of a copied module");
  assert.match(build, /await fs\.copyFile\(source, target\);\s*written\.add\(target\);/);
});

test("the built dist/ holds none of 2.x's files", () => {
  const dist = new URL("../dist/", import.meta.url);
  if (!existsSync(new URL("index.html", dist))) return;
  for (const name of ["src/styles/legacy-aliases.css", "src/styles/overlays.css", "src/styles/shell.css", "src/components/dialog.mjs", "src/components/page-chrome.mjs",
    "src/screens/games/game.mjs", "assets/fonts/comfortaa", "assets/fonts/nunito", "assets/brand/gata-league-logo.png"]) {
    assert.equal(existsSync(new URL(name, dist)), false, `dist/${name}`);
  }
});

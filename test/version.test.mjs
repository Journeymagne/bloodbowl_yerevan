import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

// The release this branch ships. The changelog's date is set on day X, by the
// redesign → main PR, so the top entry may still say «unreleased».
const RELEASE = "3.0.0";

test("the release is 3.0.0 in package.json, its lock and the changelog's top entry", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.version, RELEASE, "package.json");
  assert.equal(lock.version, RELEASE, "package-lock.json, its own version");
  assert.equal(lock.packages[""].version, RELEASE, "package-lock.json, the root package");
  assert.equal(lock.name, pkg.name, "the lock belongs to this package");

  const entries = [...read("CHANGELOG.md").matchAll(/^## \[(\d+\.\d+\.\d+)\] — (.+)$/gm)];
  assert.ok(entries.length > 0, "the changelog has release entries");
  const [, version, when] = entries[0];
  assert.equal(version, RELEASE, "the changelog's top entry");
  assert.match(when, /^(unreleased|\d{4}-\d{2}-\d{2})$/, "a release date, or «unreleased» until day X");
  assert.equal(entries.filter(([, other]) => other === RELEASE).length, 1, "one entry for the release");
});

test("the readme names the release the package is", () => {
  const named = /Current release: \*\*(\d+\.\d+\.\d+)\*\*/.exec(read("README.md"));
  assert.ok(named, "the readme says which release it describes");
  assert.equal(named[1], RELEASE);
});

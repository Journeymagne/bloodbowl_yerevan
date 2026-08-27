import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveStaticPath } from "../server/http/static-path.mjs";

// Resolved rather than written literally: path.resolve() on Windows puts this
// on the current drive, and the expectations have to agree with what the
// function computes, not with what a POSIX shell would print.
const root = path.resolve("/opt/bloodbowl-league");
const resolve = (pathname) => resolveStaticPath(pathname, root);

test("serves the entry point", () => {
  assert.equal(resolve("/"), path.join(root, "index.html"));
  assert.equal(resolve("/index.html"), path.join(root, "index.html"));
});

test("serves files from the allowed directories", () => {
  assert.equal(resolve("/src/app.js"), path.join(root, "src/app.js"));
  assert.equal(resolve("/public/data.en.json"), path.join(root, "public/data.en.json"));
  assert.equal(resolve("/assets/brand/gata-league-logo-96.png"), path.join(root, "assets/brand/gata-league-logo-96.png"));
  assert.equal(resolve("/dist/index.html"), path.join(root, "dist/index.html"));
  assert.equal(resolve("/src/i18n/ru.json"), path.join(root, "src/i18n/ru.json"));
});

test("refuses secrets and repository internals", () => {
  for (const pathname of [
    "/.env",
    "/.env.example",
    "/.git/config",
    "/.git/HEAD",
    "/.gitignore",
    "/server/server.mjs",
    "/server/init.sql",
    "/scripts/build-data.mjs",
    "/package.json",
    "/package-lock.json",
    "/docker-compose.yml",
    "/CLAUDE.md",
    "/DEPLOYMENT.md",
    "/content/Gata/Rules/3. Team Management.md",
    "/deploy/caddy/bloodbowlyerevan.shitpostsoftware.com.conf",
  ]) {
    assert.equal(resolve(pathname), null, `expected ${pathname} to be refused`);
  }
});

test("refuses percent-encoded and mixed-case attempts at the same files", () => {
  for (const pathname of [
    "/%2Eenv",
    "/%2e%65nv",
    "/src/../.env",
    "/src/%2e%2e/.env",
    "/public/../../etc/passwd",
    "/%2e%2e/etc/passwd",
    "/..%2fetc%2fpasswd",
    "/..%5cwindows",
    "/src%2f..%2f.env",
  ]) {
    assert.equal(resolve(pathname), null, `expected ${pathname} to be refused`);
  }
});

test("refuses dotfiles nested inside allowed directories", () => {
  assert.equal(resolve("/public/.env"), null);
  assert.equal(resolve("/assets/.git/config"), null);
  assert.equal(resolve("/src/.hidden/secret.js"), null);
});

test("refuses malformed input", () => {
  assert.equal(resolve(""), null);
  assert.equal(resolve("src/app.js"), null);
  assert.equal(resolve("//"), null);
  assert.equal(resolve("/%E0%A4%A"), null);
  assert.equal(resolve("/src/app.js\u0000.png"), null); // NUL injection
  assert.equal(resolve("/src/sub\u0000/../../.env"), null);
  assert.equal(resolve(undefined), null);
});

test("refuses directories that merely start with an allowed name", () => {
  assert.equal(resolve("/source/imports/secret.xlsx"), null);
  assert.equal(resolve("/distribution/x.js"), null);
  assert.equal(resolve("/srcx/app.js"), null);
});

test("never escapes the root", () => {
  for (const pathname of ["/dist/../../etc/passwd", "/assets/../../../root/.ssh/id_rsa"]) {
    const resolved = resolve(pathname);
    assert.ok(resolved === null || resolved.startsWith(root + path.sep), `${pathname} escaped the root`);
  }
});

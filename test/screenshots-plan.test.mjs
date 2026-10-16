import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAC_CHROME,
  expandShots,
  heightFor,
  parseDevToolsActivePort,
  parseScreenshotArgs,
  shotFileName,
} from "../scripts/screenshots/plan.mjs";
import {
  describeProblem,
  fromErrorsJson,
  groupProblems,
  mergeResults,
  renderIndexHtml,
  summarizeResults,
  toErrorsJson,
} from "../scripts/screenshots/report.mjs";

const light = { name: "light", storage: { "gata-league-theme": "light-parchment", "gata-league-locale": "en" } };
const dark = { name: "dark", storage: { "gata-league-theme": "dark-gata", "gata-league-locale": "en" } };
const spec = (extra = {}) => ({
  variants: [light, dark],
  states: [{ id: "A1", url: "http://localhost:3002/#/" }],
  ...extra,
});
const names = (shots) => shots.map((shot) => shotFileName(shot));

test("a state with no overrides is shot at 390 and 1440 in every variant", () => {
  const shots = expandShots(spec());
  assert.deepEqual(names(shots), [
    "A1-390-light.png", "A1-390-dark.png", "A1-1440-light.png", "A1-1440-dark.png",
  ]);
  assert.deepEqual(shots.map((shot) => [shot.width, shot.height, shot.mobile]), [
    [390, 844, true], [390, 844, true], [1440, 900, false], [1440, 900, false],
  ]);
  assert.equal(shots[0].url, "http://localhost:3002/#/");
  assert.equal(shots[0].origin, "http://localhost:3002");
  assert.equal(shots[0].login, null);
  assert.equal(shots[0].run, "");
  assert.equal(shots[0].waitMs, 800);
  assert.equal(shots[0].runWaitMs, 600);
  assert.equal(shots[0].fullPage, false);
});

test("the file's widths replace the defaults and a state's widths replace those", () => {
  assert.deepEqual(
    expandShots(spec({ widths: [768] })).map((shot) => shot.width),
    [768, 768],
  );
  const own = spec({ widths: [768], states: [{ id: "A10", url: "http://localhost:3002/", widths: [390] }] });
  assert.deepEqual(expandShots(own).map((shot) => shot.width), [390, 390]);
});

test("extraWidths add to whatever the widths are and never repeat one", () => {
  const extra = spec({ states: [{ id: "A1", url: "http://localhost:3002/", extraWidths: [768, 1024, 390] }] });
  assert.deepEqual(
    [...new Set(expandShots(extra).map((shot) => shot.width))],
    [390, 1440, 768, 1024],
  );
  assert.equal(expandShots(extra).length, 4 * 2);
  const both = spec({ states: [{ id: "A1", url: "http://localhost:3002/", widths: [390], extraWidths: [768] }] });
  assert.deepEqual([...new Set(expandShots(both).map((shot) => shot.width))], [390, 768]);
});

test("variants come inside widths, which come inside states, in file order", () => {
  const two = spec({
    states: [
      { id: "A1", url: "http://localhost:3002/#/" },
      { id: "B1", url: "http://localhost:3002/#/my-teams", widths: [1440] },
    ],
  });
  assert.deepEqual(names(expandShots(two)), [
    "A1-390-light.png", "A1-390-dark.png", "A1-1440-light.png", "A1-1440-dark.png",
    "B1-1440-light.png", "B1-1440-dark.png",
  ]);
});

test("variant storage goes first and a state's own storage wins over it", () => {
  const stored = spec({
    widths: [390],
    states: [{ id: "C1", url: "http://localhost:5174/#/", storage: { "gata-league-auth-token": "mock", "gata-league-locale": "ru" } }],
  });
  const [lightShot, darkShot] = expandShots(stored);
  assert.deepEqual(lightShot.storage, {
    "gata-league-theme": "light-parchment", "gata-league-locale": "ru", "gata-league-auth-token": "mock",
  });
  assert.equal(darkShot.storage["gata-league-theme"], "dark-gata");
  assert.equal(light.storage["gata-league-locale"], "en", "the variant itself is left alone");
});

test("a file with no variants is shot once, as default, with no storage", () => {
  const shots = expandShots({ states: [{ id: "A1", url: "http://localhost:3002/" }], widths: [390] });
  assert.deepEqual(names(shots), ["A1-390-default.png"]);
  assert.deepEqual(shots[0].storage, {});
});

test("--only keeps the named states, in the file's order", () => {
  const many = spec({
    widths: [390],
    states: [
      { id: "A1", url: "http://localhost:3002/" },
      { id: "A2", url: "http://localhost:3002/#/pages" },
      { id: "B1", url: "http://localhost:3002/#/my-teams" },
    ],
  });
  assert.deepEqual(names(expandShots(many, { only: ["B1", "A1"] })), [
    "A1-390-light.png", "A1-390-dark.png", "B1-390-light.png", "B1-390-dark.png",
  ]);
  assert.equal(expandShots(many, { only: null }).length, 6);
  assert.throws(() => expandShots(many, { only: ["A1", "Z9", "Z8"] }), /unknown state.*Z9, Z8/);
});

test("a height comes from the file, then the built-in table, then 1.6 times the width", () => {
  assert.equal(heightFor({ 390: 800 }, 390), 800);
  assert.equal(heightFor({}, 390), 844);
  assert.equal(heightFor({}, 500), 800);
  assert.equal(heightFor({ 500: "tall" }, 500), 800);
  assert.equal(heightFor({ 500: 0 }, 500), 800);
  assert.equal(heightFor({}, 333), Math.round(333 * 1.6));
  const shots = expandShots(spec({ widths: [500, 390], heights: { 390: 700 } }));
  assert.deepEqual(shots.map((shot) => shot.height), [800, 800, 700, 700]);
});

test("a state's own fields reach its shots: login, run, waits and fullPage", () => {
  const rich = spec({
    widths: [390],
    states: [
      { id: "B2", url: "http://localhost:3002/#/builder", login: "admin", run: "a()", waitMs: 100, runWaitMs: 50, fullPage: true },
      { id: "B3", url: "http://localhost:3002/#/x", run: ["one();", "two();"] },
    ],
  });
  const shots = expandShots(rich);
  assert.deepEqual(
    [shots[0].login, shots[0].run, shots[0].waitMs, shots[0].runWaitMs, shots[0].fullPage],
    ["admin", "a()", 100, 50, true],
  );
  assert.equal(shots[2].run, "one();\ntwo();");
});

test("a states file that cannot be shot is refused with the reason", () => {
  const bad = (change, pattern) => assert.throws(() => expandShots(spec(change)), pattern);
  bad({ states: [] }, /at least one state/);
  bad({ states: undefined }, /at least one state/);
  bad({ states: [{ url: "http://localhost:3002/" }] }, /needs an id/);
  bad({ states: [{ id: "A 1", url: "http://localhost:3002/" }] }, /id "A 1"/);
  bad({ states: [{ id: "../x", url: "http://localhost:3002/" }] }, /id "\.\.\/x"/);
  bad({ states: [{ id: "A1" }] }, /A1.*url/);
  bad({ states: [{ id: "A1", url: "not a url" }] }, /A1.*url/);
  bad({ states: [{ id: "A1", url: "http://localhost:3002/" }, { id: "A1", url: "http://localhost:3002/" }] }, /A1.*twice/);
  bad({ states: [{ id: "A1", url: "http://localhost:3002/", login: "root" }] }, /A1.*login/);
  bad({ states: [{ id: "A1", url: "http://localhost:3002/", storage: { key: 1 } }] }, /A1.*storage/);
  bad({ states: [{ id: "A1", url: "http://localhost:3002/", widths: [] }] }, /A1.*widths/);
  bad({ states: [{ id: "A1", url: "http://localhost:3002/", widths: [0] }] }, /A1.*widths/);
  bad({ variants: [{ name: "a/b" }] }, /variant/);
  bad({ variants: [light, light] }, /variant "light".*twice/);
});

test("a shot is named id, width, variant", () => {
  assert.equal(shotFileName({ id: "C2", width: 1024, variant: "dark" }), "C2-1024-dark.png");
});

test("the arguments name a states file and an output directory", () => {
  const darwin = { platform: "darwin", env: {} };
  assert.deepEqual(parseScreenshotArgs(["states.json", "--out", "output/x"], darwin), {
    statesPath: "states.json", outDir: "output/x", chromePath: DEFAULT_MAC_CHROME, only: null,
  });
  assert.deepEqual(parseScreenshotArgs(["--out=output/x", "states.json"], darwin).outDir, "output/x");
  assert.deepEqual(parseScreenshotArgs(["s.json", "--out", "o", "--only", "A1, B2,,C3"], darwin).only, ["A1", "B2", "C3"]);
  assert.deepEqual(parseScreenshotArgs(["s.json", "--out", "o", "--only=A1"], darwin).only, ["A1"]);
  assert.equal(parseScreenshotArgs(["s.json", "--out", "o", "--chrome", "/opt/chrome"], darwin).chromePath, "/opt/chrome");
  assert.equal(parseScreenshotArgs(["s.json", "--out", "o", "--chrome=/opt/chrome"], darwin).chromePath, "/opt/chrome");
});

test("Chrome is the Mac app on a Mac, CHROME_PATH elsewhere, and --chrome beats both", () => {
  const argv = ["s.json", "--out", "o"];
  assert.equal(parseScreenshotArgs(argv, { platform: "linux", env: { CHROME_PATH: "/usr/bin/chromium" } }).chromePath, "/usr/bin/chromium");
  assert.equal(parseScreenshotArgs(argv, { platform: "darwin", env: { CHROME_PATH: "/opt/chrome" } }).chromePath, "/opt/chrome");
  assert.equal(
    parseScreenshotArgs([...argv, "--chrome", "/mine"], { platform: "linux", env: { CHROME_PATH: "/usr/bin/chromium" } }).chromePath,
    "/mine",
  );
  assert.throws(() => parseScreenshotArgs(argv, { platform: "linux", env: {} }), /CHROME_PATH/);
});

test("arguments that would leave the run ambiguous are refused", () => {
  const darwin = { platform: "darwin", env: {} };
  const refused = (argv, pattern) => assert.throws(() => parseScreenshotArgs(argv, darwin), pattern, JSON.stringify(argv));
  refused([], /states file/);
  refused(["--out", "o"], /states file/);
  refused(["s.json"], /--out/);
  refused(["s.json", "--out"], /--out needs a value/);
  refused(["s.json", "--out", "--only", "A1"], /--out needs a value/);
  refused(["s.json", "--out="], /--out needs a value/);
  refused(["s.json", "--out", "o", "--only"], /--only needs a value/);
  refused(["s.json", "--out", "o", "--only", ",,"], /--only needs a value/);
  refused(["s.json", "--out", "o", "--chrome"], /--chrome needs a value/);
  refused(["s.json", "--out", "o", "--out", "p"], /--out given twice/);
  refused(["s.json", "--out", "o", "--colour", "red"], /unexpected argument --colour/);
  refused(["s.json", "other.json", "--out", "o"], /unexpected argument other\.json/);
});

test("DevToolsActivePort gives the port, and nothing until Chrome has finished writing it", () => {
  assert.deepEqual(parseDevToolsActivePort("9222\n/devtools/browser/1b2c-3d\n"), { port: 9222, browserPath: "/devtools/browser/1b2c-3d" });
  assert.deepEqual(parseDevToolsActivePort("9222\r\n/devtools/browser/x"), { port: 9222, browserPath: "/devtools/browser/x" });
  assert.deepEqual(parseDevToolsActivePort("51234\n"), { port: 51234, browserPath: "" });
  for (const text of ["", "92", "9222", "\n", "abc\n/x", "0\n/x", "70000\n/x", "-5\n/x", null, undefined]) {
    assert.equal(parseDevToolsActivePort(text), null, JSON.stringify(text));
  }
});

test("only errors count as problems, and each lands in the bucket the owner reads it by", () => {
  assert.equal(describeProblem("Runtime.consoleAPICalled", { type: "log", args: [{ type: "string", value: "hello" }] }), null);
  assert.deepEqual(
    describeProblem("Runtime.consoleAPICalled", {
      type: "error",
      args: [{ type: "string", value: "failed:" }, { type: "number", value: 42 }, { type: "object", description: "TypeError: x" }],
    }),
    { bucket: "console", text: "failed: 42 TypeError: x" },
  );
  assert.deepEqual(
    describeProblem("Runtime.exceptionThrown", {
      exceptionDetails: { text: "Uncaught", exception: { description: "ReferenceError: nope is not defined\n    at x" } },
    }),
    { bucket: "exceptions", text: "ReferenceError: nope is not defined\n    at x" },
  );
  assert.deepEqual(
    describeProblem("Runtime.exceptionThrown", { exceptionDetails: { text: "Uncaught SyntaxError" } }),
    { bucket: "exceptions", text: "Uncaught SyntaxError" },
  );
  assert.equal(describeProblem("Log.entryAdded", { entry: { level: "warning", text: "meh" } }), null);
  assert.deepEqual(
    describeProblem("Log.entryAdded", { entry: { level: "error", source: "javascript", text: "boom", url: "http://x/app.js" } }),
    { bucket: "console", text: "boom", url: "http://x/app.js" },
  );
  assert.deepEqual(
    describeProblem("Log.entryAdded", { entry: { level: "error", source: "network", text: "Failed to load resource: 404", url: "http://x/a.png" } }),
    { bucket: "requests", text: "Failed to load resource: 404", url: "http://x/a.png" },
  );
  assert.deepEqual(
    describeProblem("Network.loadingFailed", { requestId: "7", errorText: "net::ERR_CONNECTION_REFUSED" }, (id) => `http://x/${id}`),
    { bucket: "requests", text: "net::ERR_CONNECTION_REFUSED", url: "http://x/7" },
  );
  assert.equal(describeProblem("Network.loadingFailed", { requestId: "7", errorText: "net::ERR_ABORTED", canceled: true }), null);
  assert.equal(describeProblem("Page.loadEventFired", {}), null);
});

test("a very long console message is cut, not stored whole", () => {
  const found = describeProblem("Runtime.consoleAPICalled", { type: "error", args: [{ type: "string", value: "x".repeat(5000) }] });
  assert.ok(found.text.length <= 600);
  assert.ok(found.text.endsWith("..."));
});

const result = (over = {}) => ({
  id: "A1", width: 390, variant: "light", file: "A1-390-light.png", url: "http://localhost:3002/#/",
  failure: null, problems: { console: [], exceptions: [], requests: [] }, ...over,
});

test("the summary counts what was written, what failed and which shots had problems", () => {
  const summary = summarizeResults([
    result(),
    result({ file: "A1-390-dark.png", variant: "dark", problems: { console: [{ text: "a" }, { text: "b" }], exceptions: [{ text: "c" }], requests: [] } }),
    result({ file: "A1-1440-light.png", width: 1440, failure: "login failed (HTTP 401)" }),
  ]);
  assert.equal(summary.written, 2);
  assert.equal(summary.failed.length, 1);
  assert.equal(summary.failed[0].file, "A1-1440-light.png");
  assert.deepEqual(summary.withProblems.map((item) => [item.file, item.count]), [["A1-390-dark.png", 3]]);
});

test("the index page lists every shot with its id, width and variant, and says what went wrong", () => {
  const html = renderIndexHtml([
    result(),
    result({ file: "A1-390-dark.png", variant: "dark", problems: { console: [{ text: "Uncaught <b>boom</b>" }], exceptions: [], requests: [{ text: "net::ERR_X", url: "http://x/a?b=1&c=2" }] } }),
    result({ id: "B2", file: "B2-390-light.png", failure: "target <closed>" }),
  ], { title: "rd-04 before" });
  assert.match(html, /^<!doctype html>/i);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<img[^>]+src="A1-390-light\.png"/);
  assert.match(html, /<img[^>]+src="A1-390-dark\.png"/);
  assert.match(html, /A1/);
  assert.match(html, /390/);
  assert.match(html, /dark/);
  assert.ok(html.includes("Uncaught &lt;b&gt;boom&lt;/b&gt;"), "console text is escaped");
  assert.ok(html.includes("http://x/a?b=1&amp;c=2"), "urls are escaped");
  assert.ok(html.includes("target &lt;closed&gt;"), "a failure is shown, escaped");
  assert.doesNotMatch(html, /<img[^>]+src="B2-390-light\.png"/, "a shot that was not taken has no image");
  assert.match(html, /<title>rd-04 before<\/title>/);
});

test("the same complaint in many shots is listed once, with the shots it came from", () => {
  const grouped = groupProblems([
    result({ problems: { console: [{ text: "boom" }], exceptions: [], requests: [{ text: "404", url: "http://x/a" }] } }),
    result({ file: "A1-390-dark.png", problems: { console: [{ text: "boom" }, { text: "boom" }], exceptions: [], requests: [] } }),
    result({ file: "A2-390-dark.png", problems: { console: [{ text: "other" }], exceptions: [], requests: [] } }),
  ]);
  assert.deepEqual(
    grouped.map((group) => [group.bucket, group.text, group.url, group.files]),
    [
      ["console", "boom", "", ["A1-390-light.png", "A1-390-dark.png"]],
      ["requests", "404", "http://x/a", ["A1-390-light.png"]],
      ["console", "other", "", ["A2-390-dark.png"]],
    ],
  );
});

test("errors.json keeps what is needed to rebuild the page, and ignores what it does not know", () => {
  const taken = [
    result(),
    result({ file: "A1-390-dark.png", variant: "dark", problems: { console: [{ text: "boom" }], exceptions: [], requests: [] } }),
    result({ file: "B2-390-light.png", id: "B2", failure: "login failed (HTTP 401)" }),
  ];
  const json = toErrorsJson(taken);
  assert.deepEqual(Object.keys(json), ["A1-390-light", "A1-390-dark", "B2-390-light"]);
  assert.deepEqual(json["A1-390-dark"].console, [{ text: "boom" }]);
  assert.deepEqual(fromErrorsJson(JSON.parse(JSON.stringify(json))), taken);
  assert.deepEqual(fromErrorsJson(null), []);
  assert.deepEqual(fromErrorsJson({ "A1-390-light": { url: "an older file without ids" }, junk: 5 }), []);
});

test("retaking some shots replaces them in place and keeps the others on the page", () => {
  const before = [
    result({ file: "A1-390-light.png", failure: "first try failed" }),
    result({ file: "A2-390-light.png", id: "A2" }),
  ];
  const merged = mergeResults(before, [result({ file: "A1-390-light.png" }), result({ file: "A3-390-light.png", id: "A3" })]);
  assert.deepEqual(merged.map((item) => [item.file, item.failure]), [
    ["A1-390-light.png", null], ["A2-390-light.png", null], ["A3-390-light.png", null],
  ]);
});

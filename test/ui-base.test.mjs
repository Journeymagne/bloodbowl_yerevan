import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import test from "node:test";

import { assertContrast, blocks, inMedia, read, valuesOf } from "./helpers/contrast.mjs";

const BASE = "src/ui/base.css";
const sheets = () => readdirSync(new URL("../src/", import.meta.url), { recursive: true })
  .filter((name) => name.endsWith(".css"))
  .map((name) => `src/${name.replaceAll("\\", "/")}`);

// Stage 13, Task 22 (decision 7): what 2.x's shell.css and the globals of overlays.css gave every screen is 3.0's own now.
test("the base is 3.0's: border-box, the body on the page colour, controls in the page's font, one focus ring, reduced motion", () => {
  for (const selector of ["*", "*::before", "*::after"]) assert.deepEqual(valuesOf(BASE, selector, "box-sizing"), ["border-box"], selector);
  const body = (property) => valuesOf(BASE, "body", property);
  assert.deepEqual([body("margin"), body("min-width"), body("background"), body("color"), body("font-size")],
    [["0"], [], ["var(--page)"], ["var(--ink)"], ["15px"]]);
  // No floor under the body anywhere: a page under 320px of CSS (a 360px phone zoomed to 125%) must not scroll sideways
  // (review of stage 13; 2.x reset its 320px to 0 on phones).
  for (const sheet of sheets()) assert.deepEqual(valuesOf(sheet, "body", "min-width"), [], sheet);
  for (const control of ["button", "input", "select", "textarea"]) assert.deepEqual(valuesOf(BASE, control, "font"), ["inherit"], control);
  assert.deepEqual(valuesOf(BASE, "a", "color"), ["inherit"]);

  // One ring for every element, of no specificity: a component that draws its own (.g-tab:focus-visible) wins.
  assert.deepEqual(valuesOf(BASE, ":where(:focus-visible)", "outline"), ["3px solid var(--accent-text)"]);
  assert.deepEqual(valuesOf(BASE, ":where(:focus-visible)", "outline-offset"), ["0"]);
  assert.deepEqual(valuesOf(BASE, ":where(:focus-visible)", "border-radius"), [], "the ring takes the element's own corners");
  assert.deepEqual(valuesOf(BASE, ":focus:not(:focus-visible)", "outline"), ["none"]);
  assertContrast("--accent-text", ["--page", "--surface", "--surface-2"], 3, { what: "the focus ring" });

  for (const selector of ["*", "*::before", "*::after"]) {
    assert.deepEqual(inMedia(BASE, "prefers-reduced-motion: reduce", selector, "animation-duration"), ["0.01ms !important"], selector);
    assert.deepEqual(inMedia(BASE, "prefers-reduced-motion: reduce", selector, "transition-duration"), ["0.01ms !important"], selector);
  }

  const imports = [...read("src/styles.css").matchAll(/@import url\("([^"]+)"\);/g)].map(([, file]) => file);
  assert.ok(!imports.includes("styles/shell.css"), "shell.css is not imported");
  assert.equal(existsSync(new URL("../src/styles/shell.css", import.meta.url)), false, "shell.css is gone");
  assert.ok(imports.indexOf("ui/base.css") < imports.findIndex((file) => file.startsWith("ui/") && file !== "ui/base.css"), "the base before every component");
});

test("no stylesheet styles a bare heading, option or the 2.x focus", () => {
  const bare = /^(?:h[1-6]|option)(?![\w-])(?::[\w-]+)*$/;
  // A rule for whatever has the focus, whoever it is: base.css's alone.
  const everyFocus = new Set([":focus", ":focus-visible", "*:focus", "*:focus-visible", ":where(:focus-visible)", ":focus:not(:focus-visible)",
    ':where([class^="g-"], [class*=" g-"]):focus-visible']);
  const found = [];
  for (const file of sheets()) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) {
        if (bare.test(selector)) found.push(`${file}: ${selector}`);
        if (file !== BASE && everyFocus.has(selector)) found.push(`${file}: ${selector}`);
      }
    }
  }
  assert.deepEqual(found, []);
  // The old rings: 2.x's two-pixel one off the element, and 3.0's that only a g- class reached.
  for (const file of sheets()) {
    assert.doesNotMatch(read(file), /\[class\^="g-"\]/, file);
    assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\//g, ""), /outline:\s*2px solid var\(--focus\)/, file);
  }
});

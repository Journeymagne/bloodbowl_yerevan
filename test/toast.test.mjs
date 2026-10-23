import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { mediaQueries } from "./helpers/css.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { toast, toastError } from "../src/components/toast.mjs";
import { announce } from "../src/components/live-region.mjs";
import { patch } from "../src/core/dom.mjs";
import { patchWithModal, renderSheet } from "../src/ui/sheet.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const CSS = "src/ui/toast.css";

// toast() tells a repeat by the region's lastElementChild, which a browser has and the fake page does not: without it
// every message is a new one, as the screens' tests count them (one toast a press). Here, and only in this file, the
// fake element gets it, so the repeat is tested as a browser runs it.
Object.defineProperty(Object.getPrototypeOf(document.createElement("div")), "lastElementChild", {
  configurable: true,
  get() { return this.childNodes.filter((node) => node.nodeType === 1).at(-1) ?? null; },
});

/** A fresh page: the view alone in the body (`mount` takes the last test's page, its toasts among it, away). */
const page = () => {
  mount('<section id="app-view"></section>');
  return document.querySelector("#app-view");
};
/** A screen with a sheet in it, as a screen of 3.0 draws one (the sheet closed; patchWithModal opens it). */
const screen = (body = "One") => `<section class="g-page"><h1>Page</h1>${renderSheet({ id: "money", title: "Money", bodyHtml: `<p>${body}</p>` })}</section>`;
/** The toasts' region. Found by its attributes: the fake page keeps `className` as a property, as code reads it. */
const region = () => document.querySelector('[role="status"][data-patch-keep]');
const texts = () => document.querySelectorAll("output").map((node) => node.textContent);

// Stage 13 (decision 8; hand-off 07a): an open modal dialog puts the page under its backdrop and makes it inert, so a
// toast in the body was neither seen nor heard while a sheet was open. Its region stands in the top open modal.
test("a toast while a sheet is open stands in that sheet, above its backdrop; once the sheet closes the region goes back to the body", async () => {
  await withoutTimers(() => {
    const view = page();
    patchWithModal(view, screen(), "#money");
    const sheet = view.querySelector("#money");
    assert.ok(sheet.matches(":modal"));
    toast("A");
    assert.equal(region().parentNode, sheet, "in the open sheet, in the top layer with it, and not inert");
    assert.deepEqual([region().className, region().getAttribute("aria-live")], ["g-toasts", "polite"]);
    assert.equal(document.querySelectorAll("[data-patch-keep]").length, 1);
    sheet.close();
    assert.equal(region().parentNode, document.body, "the sheet closed: back in the body");
    assert.deepEqual(texts(), ["A"], "with what it shows");
    toast("B");
    assert.equal(region().parentNode, document.body);
    assert.deepEqual(texts(), ["A", "B"]);
    assert.equal(document.querySelectorAll("[data-patch-keep]").length, 1, "one region, wherever it stands");
  });
});

// Pre-flight L9: a screen draws its sheet again on every step (patchWithModal, core/dom.mjs patch), and the markup
// has no region: patch would take it, and the toast with it, away on the next keystroke.
test("a redraw of the open sheet keeps the toast and its region", async () => {
  await withoutTimers(() => {
    const view = page();
    patchWithModal(view, screen("One"), "#money");
    toast("Refused.", { tone: "error" });
    patchWithModal(view, screen("Two"), "#money");
    const sheet = view.querySelector("#money");
    assert.ok(sheet.matches(":modal"));
    assert.equal(sheet.querySelector(".g-sheet__body").textContent, "Two", "the sheet was drawn again");
    assert.equal(region().parentNode, sheet);
    assert.deepEqual(texts(), ["Refused."]);
    // The same refusal pressed again is still one toast: the region kept the first.
    toast("Refused.", { tone: "error" });
    assert.deepEqual(texts(), ["Refused."]);
    assert.ok(sheet.childNodes.at(-1) === region(), "after the panel, which the redraw left first");
  });
});

test("a sheet a redraw takes away without closing it leaves its toast on the page, and the next toast takes the region to the body", async () => {
  await withoutTimers(() => {
    const view = page();
    patchWithModal(view, screen(), "#money");
    toast("Saved.");
    // drawScreen and patch close nothing: the next screen's markup has no sheet, and the dialog goes.
    patch(view, '<section class="g-page"><h1>Next</h1></section>');
    assert.equal(view.querySelector("#money"), null);
    assert.ok(region().isConnected, "the toast is still on the page");
    assert.deepEqual(texts(), ["Saved."]);
    toast("Next.");
    assert.equal(region().parentNode, document.body);
    assert.deepEqual(texts(), ["Saved.", "Next."]);
  });
});

test("a toast over two open dialogs stands in the top one, and goes down one at a time as they close", async () => {
  await withoutTimers(() => {
    const view = page();
    patchWithModal(view, screen(), "#money");
    const sheet = view.querySelector("#money");
    // A question asked over the sheet (ui/sheet.mjs confirmAction): a dialog at the end of the body.
    const asking = el(document, "dialog", { class: "g-sheet", id: "asking" });
    document.body.appendChild(asking);
    asking.showModal();
    toast("Over both.");
    assert.equal(region().parentNode, asking);
    asking.close();
    assert.equal(region().parentNode, sheet, "the sheet under it is still modal: the rest of the page is still inert");
    sheet.close();
    assert.equal(region().parentNode, document.body);
    assert.deepEqual(texts(), ["Over both."]);
  });
});

test("the same message twice running is one toast; a press on it closes it", async () => {
  await withoutTimers(() => {
    page();
    toast("Once.");
    toast("Once.");
    toast("  ");
    assert.deepEqual(texts(), ["Once."], "a repeat refreshes the first; nothing to say is no toast");
    toastError(new Error("Twice."));
    assert.deepEqual(document.querySelectorAll("output").map((node) => node.className), ["g-toast g-toast--info", "g-toast g-toast--error"]);
    const css = read(CSS);
    for (const name of [region().className, ...document.querySelectorAll("output").flatMap((node) => node.className.split(" "))]) {
      assert.match(css, new RegExp(`\\.${name}(?![\\w-])`), `.${name} is not styled`);
    }
    fireEvent(document.querySelectorAll("output")[0], "click");
    assert.deepEqual(texts(), ["Twice."]);
  });
});

// Decision 8: no prototype draws a toast, so it is drawn on the tokens. Pre-flight L2: an error's stripe is --danger,
// not --danger-fill (the red button's alone), and the sheet is imported in the block of ui/ sheets.
test("a toast is drawn on the 3.0 tokens, from 44px", () => {
  assert.deepEqual(valuesOf(CSS, ".g-toast", "min-height"), ["44px"], "a tap closes it");
  assert.deepEqual(valuesOf(CSS, ".g-toast", "background"), ["var(--surface)"]);
  assert.deepEqual(valuesOf(CSS, ".g-toast", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf(CSS, ".g-toast", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(valuesOf(CSS, ".g-toast", "font"), ["400 14px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-toast", "border-left"), ["3px solid"]);
  assertReadable(CSS, ".g-toast", "color", ["--surface"], 4.5);
  // The stripe is the one thing that tells a refusal from news at a glance: a graphic, 3:1 on the surface in all eight.
  assertReadable(CSS, ".g-toast--info", "border-left-color", ["--surface"], 3);
  assertReadable(CSS, ".g-toast--error", "border-left-color", ["--surface"], 3);
  assert.deepEqual(valuesOf(CSS, ".g-toast--error", "border-left-color"), ["var(--danger)"]);
  assert.deepEqual(
    ["position", "right", "bottom", "z-index", "max-width"].map((name) => valuesOf(CSS, ".g-toasts", name)),
    [["fixed"], ["var(--space-16)"], ["var(--space-16)"], ["60"], ["min(380px, calc(100vw - 32px))"]],
  );
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /ellipsis|nowrap|--danger-fill/, "long words wrap; the red fill is the danger button's");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.g-toast \{ animation: g-toast-in 160ms ease-out; \}/, "it rises only for whoever did not ask for less motion");
  for (const query of mediaQueries(CSS)) assert.equal(query, "(prefers-reduced-motion: no-preference)");
  assert.ok(read("src/styles.css").includes('@import url("ui/page-head.css");\n@import url("ui/toast.css");\n'), "among the ui/ sheets, before every screen's");
});

// Step 15.5's narrow region, in 3.0's class: off-screen, one sentence at a time.
test("the live region is 3.0's", async () => {
  page();
  announce("Saved.");
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  const said = document.querySelector('[role="status"]');
  assert.equal(said?.getAttribute("aria-live"), "polite");
  assert.equal(said.className, "g-sr-only");
  assert.equal(said.textContent, "Saved.");
  assert.ok(valuesOf("src/ui/base.css", ".g-sr-only", "position").includes("absolute"));
});

// Pre-flight L9, in core/dom.mjs itself: a kept node is no candidate for the markup's children, wherever it stands.
test("patch matches nothing to a kept node, takes it nowhere, and keeps one that a node it drops held", () => {
  const view = page();
  patch(view, "<p>a</p><div><p>inner</p></div>");
  const [first, block] = [view.querySelector("p"), view.querySelector("div")];
  const kept = el(document, "div", { "data-patch-keep": "" });
  view.insertBefore(kept, view.firstChild);
  patch(view, "<p>b</p><div><p>inner</p></div>");
  assert.ok(view.querySelector("p") === first, "the paragraph after the kept node is the one patched, not a new one");
  assert.equal(first.textContent, "b");
  assert.ok(block.parentNode === view && kept.parentNode === view, "both still there");
  assert.ok(view.childNodes.at(-1) === kept, "the kept node after what the markup draws");
  const held = el(document, "div", { "data-patch-keep": "" });
  block.appendChild(held);
  patch(view, "<p>c</p>");
  assert.equal(block.parentNode, null, "the dropped block went");
  assert.ok(held.parentNode === view && kept.parentNode === view, "what it held stays, in the view");
});

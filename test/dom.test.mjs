import test from "node:test";
import assert from "node:assert/strict";

import { delegate, escapeHtml, html, isRaw, raw, toHtml } from "../src/core/dom.mjs";

test("escapeHtml neutralises everything that can break out of markup", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml('" onerror="alert(1)'), "&quot; onerror=&quot;alert(1)");
  // The previous implementation left single quotes alone, which is fine for
  // double-quoted attributes and not fine the day someone writes attr='...'.
  assert.equal(escapeHtml("it's"), "it&#39;s");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
});

test("escapeHtml copes with whatever it is handed", () => {
  assert.equal(escapeHtml(), "");
  assert.equal(escapeHtml(null), "null");
  assert.equal(escapeHtml(42), "42");
});

test("html escapes interpolations by default", () => {
  const name = '<img src=x onerror="alert(1)">';
  const markup = toHtml(html`<h1>${name}</h1>`);
  assert.equal(markup, "<h1>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</h1>");
  assert.doesNotMatch(markup, /<img/);
});

test("raw() is the explicit way to nest markup", () => {
  const inner = html`<span>Amazon</span>`;
  assert.equal(toHtml(html`<div>${inner}</div>`), "<div><span>Amazon</span></div>");
  assert.equal(toHtml(html`<div>${raw("<b>bold</b>")}</div>`), "<div><b>bold</b></div>");
});

test("a raw value that came from a person is still the caller's responsibility", () => {
  // raw() means "I checked this" — the point is that it is impossible to do by
  // accident, not that it is safe.
  assert.equal(toHtml(html`${raw("<script>")}`), "<script>");
  assert.equal(toHtml(html`${"<script>"}`), "&lt;script&gt;");
});

test("arrays are joined so lists need no .join(\"\")", () => {
  const rows = ["Amazon", "Goblin"].map((name) => html`<li>${name}</li>`);
  assert.equal(toHtml(html`<ul>${rows}</ul>`), "<ul><li>Amazon</li><li>Goblin</li></ul>");
});

test("null, undefined and false render as nothing, so conditionals are quiet", () => {
  assert.equal(toHtml(html`<p>${null}${undefined}${false}</p>`), "<p></p>");
  assert.equal(toHtml(html`<p>${0}</p>`), "<p>0</p>", "zero is a value, not an absence");
});

test("isRaw tells markup from text", () => {
  assert.equal(isRaw(html`<p></p>`), true);
  assert.equal(isRaw(raw("<p>")), true);
  assert.equal(isRaw("<p>"), false);
  assert.equal(isRaw(null), false);
});

// ---------------------------------------------------------------------------
// delegate() — a tiny DOM stand-in, enough to prove the matching rules
// ---------------------------------------------------------------------------

function fakeDom() {
  const listeners = new Map();
  const root = {
    contains: () => true,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    fire: (name, event) => listeners.get(name)?.(event),
    has: (name) => listeners.has(name),
  };
  return root;
}

function fakeTarget(matchSelector) {
  const element = {};
  element.closest = (selector) => (selector === matchSelector ? element : null);
  return element;
}

test("delegate fires only for matching descendants", () => {
  const root = fakeDom();
  const hits = [];
  delegate(root, "click", "[data-add-row]", (event, target) => hits.push(target));

  root.fire("click", { target: fakeTarget("[data-add-row]") });
  assert.equal(hits.length, 1);

  root.fire("click", { target: fakeTarget("[data-other]") });
  assert.equal(hits.length, 1, "a click elsewhere is ignored");

  root.fire("click", { target: { nodeType: 3 } });
  assert.equal(hits.length, 1, "a text node has no closest() and is ignored, not thrown on");

  root.fire("click", {});
  assert.equal(hits.length, 1, "an event with no target at all is ignored too");
});

test("delegate returns a way to stop listening", () => {
  const root = fakeDom();
  const stop = delegate(root, "click", "[data-x]", () => {});
  assert.equal(root.has("click"), true);
  stop();
  assert.equal(root.has("click"), false);
});

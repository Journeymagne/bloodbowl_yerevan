import test from "node:test";
import assert from "node:assert/strict";

import { delegate, escapeHtml, html, isRaw, patch, raw, toHtml } from "../src/core/dom.mjs";
import { createDocument, el, outline } from "./helpers/fake-dom.mjs";

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

// ---------------------------------------------------------------------------
// patch() — against the small DOM in test/helpers/fake-dom.mjs
// ---------------------------------------------------------------------------

function row(document, key, name) {
  return el(document, "tr", { "data-key": key }, el(document, "td", {}, name));
}

function tableOf(document, ...rows) {
  return el(document, "tbody", {}, ...rows);
}

test("patch replaces text without rebuilding the node around it", () => {
  const document = createDocument();
  const live = el(document, "div", {}, el(document, "span", {}, "Grak"));
  const span = live.childNodes[0];
  const textNode = span.childNodes[0];

  patch(live, el(document, "div", {}, el(document, "span", {}, "Grok")));

  assert.equal(live.textContent, "Grok");
  assert.equal(live.childNodes[0], span, "the span is the same node, not a replacement");
  assert.equal(span.childNodes[0], textNode, "so is the text node inside it");
});

test("patch adds and removes keyed rows, keeping the ones that stay", () => {
  const document = createDocument();
  const live = tableOf(document, row(document, "p1", "Grak"), row(document, "p2", "Urg"));
  const first = live.childNodes[0];

  patch(live, tableOf(document, row(document, "p1", "Grak"), row(document, "p3", "Zug")));

  assert.equal(outline(live), "tbody(tr#p1(td(Grak)),tr#p3(td(Zug)))");
  assert.equal(live.childNodes[0], first, "the surviving row was not rebuilt");
  assert.equal(live.childNodes.length, 2);
});

test("patch moves a keyed row instead of rebuilding it", () => {
  const document = createDocument();
  const live = tableOf(document, row(document, "p1", "Grak"), row(document, "p2", "Urg"), row(document, "p3", "Zug"));
  const [first, second, third] = live.childNodes;

  // Drag p3 to the top — what wireSavedRosterDragAndDrop does.
  patch(live, tableOf(document, row(document, "p3", "Zug"), row(document, "p1", "Grak"), row(document, "p2", "Urg")));

  assert.equal(outline(live), "tbody(tr#p3(td(Zug)),tr#p1(td(Grak)),tr#p2(td(Urg)))");
  assert.deepEqual(live.childNodes, [third, first, second], "the same three nodes, reordered");
});

test("patch replaces a node whose kind changed at the same position", () => {
  const document = createDocument();
  const live = el(document, "div", {}, el(document, "span", {}, "disabled"));
  const span = live.childNodes[0];

  patch(live, el(document, "div", {}, el(document, "button", {}, "Hire")));

  assert.equal(outline(live), "div(button(Hire))");
  assert.notEqual(live.childNodes[0], span);
});

test("patch adds, changes and removes attributes", () => {
  const document = createDocument();
  const live = el(document, "button", { class: "primary", disabled: "", title: "gone" });
  const container = el(document, "div", {}, live);
  patch(container, el(document, "div", {}, el(document, "button", { class: "primary compact", "aria-disabled": "true" })));

  assert.equal(live.getAttribute("class"), "primary compact");
  assert.equal(live.getAttribute("aria-disabled"), "true");
  assert.equal(live.getAttribute("title"), null, "an attribute the markup dropped is removed");
  assert.equal(live.getAttribute("disabled"), null);
});

test("patch leaves the focused field alone while its value is being typed", () => {
  const document = createDocument();
  const input = el(document, "input", { "data-key": "name", value: "Gra" });
  input.selectionStart = 3;
  input.selectionEnd = 3;
  const live = el(document, "div", {}, input);
  input.focus();
  input.value = "Grak"; // typed since the markup was produced

  patch(live, el(document, "div", {}, el(document, "input", { "data-key": "name", value: "Gra" })));

  assert.equal(document.activeElement, input, "focus never moved");
  assert.equal(input.value, "Grak", "the value on screen wins over the stale markup");
  assert.equal(input.selectionStart, 3, "and the caret did not jump");
});

test("patch syncs the value of a control nobody is typing in", () => {
  const document = createDocument();
  const input = el(document, "input", { "data-key": "spp", value: "3" });
  const live = el(document, "div", {}, input);

  patch(live, el(document, "div", {}, el(document, "input", { "data-key": "spp", value: "6" })));

  assert.equal(input.value, "6");
});

test("patch puts focus and caret back when the field had to be replaced", () => {
  const document = createDocument();
  const input = el(document, "input", { "data-key": "name", value: "Grak" });
  input.selectionStart = 2;
  input.selectionEnd = 4;
  const live = el(document, "div", {}, el(document, "label", {}, input));
  input.focus();

  // The label became a div, so everything under it is rebuilt.
  patch(live, el(document, "div", {}, el(document, "div", {}, el(document, "input", { "data-key": "name", value: "Grak" }))));

  const replacement = live.querySelector('[data-key="name"]');
  assert.notEqual(replacement, input, "it really was replaced");
  assert.equal(document.activeElement, replacement, "focus followed the key");
  assert.deepEqual([replacement.selectionStart, replacement.selectionEnd], [2, 4]);
});

test("patch on an empty container just fills it", () => {
  const document = createDocument();
  const live = el(document, "tbody", {});

  patch(live, tableOf(document, row(document, "p1", "Grak")));

  assert.equal(outline(live), "tbody(tr#p1(td(Grak)))");
});

test("patch empties a container the markup emptied", () => {
  const document = createDocument();
  const live = tableOf(document, row(document, "p1", "Grak"));

  patch(live, el(document, "tbody", {}));

  assert.equal(live.childNodes.length, 0);
});

test("patch survives a focused control that has no caret to save", () => {
  const document = createDocument();
  const spp = el(document, "input", { "data-key": "spp", type: "number", value: "3" });
  const live = el(document, "div", {}, el(document, "label", {}, spp));
  spp.focus();

  // A number input throws on selectionStart in a browser; capturing and
  // restoring focus must not depend on getting one.
  patch(live, el(document, "div", {}, el(document, "div", {}, el(document, "input", { "data-key": "spp", type: "number", value: "3" }))));

  assert.equal(document.activeElement, live.querySelector('[data-key="spp"]'));
});

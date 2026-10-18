import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { valuesOf } from "./helpers/contrast.mjs";
import { renderPageHead } from "../src/ui/page-head.mjs";
import { renderStatusChip } from "../src/ui/status-chip.mjs";

test("a page head is one h1 with its line and an optional slot", () => {
  const fragment = mount(renderPageHead({ title: "Settings", sub: "Account", metaHtml: renderStatusChip({ label: "Live", tone: "live" }) }));
  const head = fragment.querySelector("header.g-pagehead");
  assert.equal(fragment.querySelectorAll("h1").length, 1);
  assert.equal(head.querySelector("h1.g-pagehead__title").textContent, "Settings");
  assert.equal(head.querySelector("h1").getAttribute("tabindex"), "-1", "a screen focuses it on arrival (K4b)");
  assert.equal(head.querySelector(".g-pagehead__text .g-pagehead__sub").textContent, "Account");
  assert.ok(head.querySelector(".g-pagehead__meta .g-status"));
  assert.equal(head.classList.contains("g-pagehead--phone"), false);
  assertCspSafe(fragment);
  assertStyled(fragment, "page-head.css", "status-chip.css");
});

test("a page head without a line or a slot draws neither", () => {
  const fragment = mount(renderPageHead({ title: "Teams" }));
  assert.equal(fragment.querySelector(".g-pagehead__sub"), null);
  assert.equal(fragment.querySelector(".g-pagehead__meta"), null);
  assertStyled(fragment, "page-head.css");
});

test("a title and a line a person typed are text, not markup", () => {
  const fragment = mount(renderPageHead({ title: HOSTILE, sub: HOSTILE }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-pagehead__title").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-pagehead__sub").textContent, HOSTILE);
  assertCspSafe(fragment);
});

test("a page head that is for a phone says so with a class, and one without a title is a bug", () => {
  assert.ok(mount(renderPageHead({ title: "Roster", phone: true })).querySelector("header.g-pagehead.g-pagehead--phone"));
  assert.throws(() => renderPageHead({}), /title/);
  assert.throws(() => renderPageHead({ title: "", sub: "x" }), /title/);
});

test("from 901px it is a band on the card colour over a rule, the width of the content (DeskCoach); on a phone it is for a screen reader unless asked", () => {
  const sheet = "src/ui/page-head.css";
  assert.ok(valuesOf(sheet, ".g-pagehead", "background").includes("var(--surface)"));
  assert.ok(valuesOf(sheet, ".g-pagehead", "border-bottom").includes("1px solid var(--line)"));
  // .view pads 28px from 901px (site-matchday.css): the band reaches the content's edges over it.
  assert.ok(valuesOf(sheet, ".g-pagehead", "margin").includes("-28px -28px var(--space-24)"));
  assert.ok(valuesOf(sheet, ".g-pagehead", "max-width").includes("none"));
  assert.ok(valuesOf(sheet, ".g-pagehead:not(.g-pagehead--phone)", "clip-path").includes("inset(50%)"));
});

test("the title stays a display face at the size of its screen, on a phone and on a desk", () => {
  const sheet = "src/ui/page-head.css";
  assert.deepEqual(valuesOf(sheet, ".g-pagehead__title", "font"), ["700 26px/1.1 var(--font-display)", "700 32px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(sheet, ".g-pagehead__sub", "font"), ["400 14px/1.4 var(--font-body)"]);
});

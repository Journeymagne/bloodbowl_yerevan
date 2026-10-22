import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, inMedia, mediaText, valuesOf } from "./helpers/contrast.mjs";
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

// Stage 13 (decision 9): one band. The reference's and the guest's heads are this one, and theirs name the page with a
// paragraph: the page's h1 is the article's, the list's or the hero's.
test("a page head may title its page with a paragraph, when the page's h1 is elsewhere", () => {
  const fragment = mount(renderPageHead({ title: "Reference", sub: "Gata League", titleTag: "p" }));
  assert.equal(fragment.querySelector("h1"), null);
  const title = fragment.querySelector("header.g-pagehead p.g-pagehead__title");
  assert.equal(title.textContent, "Reference");
  assert.equal(title.hasAttribute("tabindex"), false, "a paragraph is no place a screen starts from");
  assert.equal(fragment.querySelector(".g-pagehead__text .g-pagehead__sub").textContent, "Gata League");
  assertStyled(fragment, "page-head.css");
  assert.equal(mount(renderPageHead({ title: "Reference", titleTag: "h1" })).querySelector("h1.g-pagehead__title").getAttribute("tabindex"), "-1");
  for (const titleTag of ["h2", "div", "", null]) {
    assert.throws(() => renderPageHead({ title: "Reference", titleTag }), /h1 or p/, String(titleTag));
  }
});

test("a head whose line is in a card on a phone hides it there", () => {
  const head = mount(renderPageHead({ title: "Team", sub: "TV 1,000k", phone: true, phoneSub: false })).querySelector("header.g-pagehead");
  assert.ok(head.classList.contains("g-pagehead--phone"));
  assert.ok(head.classList.contains("g-pagehead--nosub-phone"));
  assert.equal(head.querySelector(".g-pagehead__sub").textContent, "TV 1,000k", "a desk still shows it");
  assert.equal(mount(renderPageHead({ title: "Team", sub: "TV", phone: true })).querySelector(".g-pagehead--nosub-phone"), null);
  assert.deepEqual(inMedia("src/ui/page-head.css", "max-width: 900px", ".g-pagehead--nosub-phone .g-pagehead__sub", "display"), ["none"]);
  assert.deepEqual(valuesOf("src/ui/page-head.css", ".g-pagehead--nosub-phone .g-pagehead__sub", "display"), ["none"], "a phone's alone");
  assert.doesNotMatch(readFileSync(new URL("../src/screens/team/manage/manage.css", import.meta.url), "utf8"), /\.g-pagehead__sub/, "the team's page says it by the prop");
});

test("a search that is the band's own slot stands at its right, up to 420 wide and 44 tall (DeskRef), before the title gives way", () => {
  const sheet = "src/ui/page-head.css";
  assert.deepEqual(inMedia(sheet, "min-width: 901px", ".g-pagehead__meta:has(> .g-search)", "flex"), ["0 1 420px"]);
  assert.deepEqual(inMedia(sheet, "min-width: 901px", ".g-pagehead__meta:has(> .g-search)", "min-width"), ["0"]);
  assert.deepEqual(inMedia(sheet, "min-width: 901px", ".g-pagehead:has(> .g-pagehead__meta > .g-search) > .g-pagehead__text", "flex"), ["none"]);
  assert.deepEqual(inMedia(sheet, "min-width: 901px", ".g-pagehead__meta > .g-search .g-search__input", "height"), ["44px"]);
  assert.deepEqual(inMedia(sheet, "min-width: 901px", ".g-pagehead__meta > .g-search .g-search__input", "font-size"), ["15px"]);
  // The field fills the slot at any width: on a phone the slot is the line under the title.
  assert.deepEqual(valuesOf(sheet, ".g-pagehead__meta > .g-search", "flex"), ["1 1 auto"]);
  assert.deepEqual(valuesOf(sheet, ".g-pagehead__meta > .g-search", "min-width"), ["0"]);
});

test("the title and its line read on the card and on the page, in every palette", () => {
  assertReadable("src/ui/page-head.css", ".g-pagehead__title", "color", ["--page", "--surface"], 4.5);
  assertReadable("src/ui/page-head.css", ".g-pagehead__sub", "color", ["--page", "--surface"], 4.5);
});

test("from 901px it is a band on the card colour over a rule, the width of the content (DeskCoach); on a phone it is for a screen reader unless asked", () => {
  const sheet = "src/ui/page-head.css";
  assert.ok(valuesOf(sheet, ".g-pagehead", "background").includes("var(--surface)"));
  assert.ok(valuesOf(sheet, ".g-pagehead", "border-bottom").includes("1px solid var(--line)"));
  assert.ok(valuesOf(sheet, ".g-pagehead", "max-width").includes("none"));
  assert.ok(valuesOf(sheet, ".g-pagehead:not(.g-pagehead--phone)", "clip-path").includes("inset(50%)"));
});

// Stage 13 (decision 4): the frame pads the view by --view-top/-side/-bottom (shell/frame.css); a band across the top of
// the content goes out over that padding by the same figures and keeps its words where the content's edge is.
test("a band reaches the content's edges by the frame's own figures", () => {
  const back = "calc(-1 * var(--view-top)) calc(-1 * var(--view-side))";
  for (const [file, selector, margin, padding] of [
    ["src/ui/page-head.css", ".g-pagehead", `${back} var(--space-24)`, "var(--space-20) var(--view-side)"],
    ["src/screens/coaches/team.css", ".g-opp__head", `${back} 0`, "var(--space-16) var(--view-side) var(--space-20)"],
    ["src/screens/admin/admin.css", ".g-admin__head", `${back} var(--space-24)`, "var(--space-20) var(--view-side)"],
  ]) {
    assert.deepEqual(inMedia(file, "min-width: 901px", selector, "margin"), [margin], `${selector}'s margin`);
    assert.deepEqual(inMedia(file, "min-width: 901px", selector, "padding"), [padding], `${selector}'s padding`);
  }
  // The reference's and the guest's bands are this head (decision 9): no figures of their own.
  for (const file of ["src/screens/ref/ref.css", "src/screens/home/guest.css"]) {
    assert.doesNotMatch(mediaText(file, "min-width: 901px"), /var\(--view-(?:top|side)\)/, `${file}: a band of its own`);
  }
  // The builder has a frame of its own (bare: no padding on the view), so its figures are its own: DeskBuilder.html's main.
  const builder = "src/screens/teams/builder.css";
  assert.deepEqual(inMedia(builder, "min-width: 901px", ".g-build", "padding"), ["var(--space-24) 32px 40px"]);
  assert.deepEqual(inMedia(builder, "min-width: 901px", ".g-build__head", "margin"), ["calc(-1 * var(--space-24)) -32px var(--space-24)"]);
  const sheets = readdirSync(new URL("../src/", import.meta.url), { recursive: true }).filter((name) => name.endsWith(".css"));
  for (const name of sheets) assert.doesNotMatch(readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"), /-28px/, `src/${name}: the 2.x view's 28`);
});

test("the title stays a display face at the size of its screen, on a phone and on a desk", () => {
  const sheet = "src/ui/page-head.css";
  assert.deepEqual(valuesOf(sheet, ".g-pagehead__title", "font"), ["700 26px/1.1 var(--font-display)", "700 32px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(sheet, ".g-pagehead__sub", "font"), ["400 14px/1.4 var(--font-body)"]);
});

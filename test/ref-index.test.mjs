import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertReadable, blocks, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale, withWindow } from "./helpers/ref-screen.mjs";

const view = mountView();
const { renderRef } = await import("../src/screens/ref/index.mjs");
const { backLinkMarkup, goSearch, refHeadMarkup, refPageMarkup, refTocMarkup, wireRefSearch } = await import("../src/screens/ref/frame.mjs");
const { drawScreen } = await import("../src/core/dom.mjs");
const { refGroups } = await import("../src/screens/ref/catalog.mjs");
const { refQuery, setRefQuery, takeSearchFocus } = await import("../src/screens/ref/memory.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { overviewCards } = await import("../src/data/overview-cards-en.mjs");
const { shellModel } = await import("../src/shell/navigation.mjs");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const type = (value) => { const input = view.querySelector("#ref-query"); input.value = value; fireEvent(input, "input"); };
const draw = (markup) => parseHtml(document, markup);
/** The reference as a coach finds it on arrival: in English, nothing typed. */
const open = () => { useLocale("en"); setRefQuery(""); renderRef(); };

test("the reference opens on its four groups, each row a link with its description and count", () => {
  open();
  assert.equal(view.querySelector("h1").textContent, "Reference");
  assert.deepEqual(view.querySelectorAll(".g-ref-group__title").map((h) => h.textContent), ["Before and during a match", "Players", "Teams", "League"]);
  const skills = view.querySelector('a.g-list-row[href="#/ref/skills"]');
  assert.equal(skills.querySelector(".g-list-row__count").textContent, "82");
  assert.ok(skills.querySelector(".g-list-row__desc").textContent.length > 0);
  assert.equal(view.querySelector(".g-ref-toc"), null, "the index is its own table of contents");
  assertCspSafe(view);
  assertStyled(view, "src/screens/ref/ref.css", "list-row.css", "search-field.css");
});

test("the league rules count the overview's cards ahead of the regulation pages", () => {
  open();
  const rules = view.querySelector('a.g-list-row[href="#/ref/rules"]');
  assert.equal(rules.querySelector(".g-list-row__count").textContent, String(referenceData("en").rules.length + overviewCards.length));
});

test("typing narrows the reference to what matches and says how many, the caret staying in the field; a miss says so", () => {
  open();
  view.querySelector("#ref-query").focus();
  type("sidestep"); // under the limit of 50; "block" is not (over a hundred pages)
  assert.match(view.querySelector(".g-ref-found").textContent, /^Found: \d+$/);
  assert.equal(view.querySelector("a.g-list-row").getAttribute("href"), "#/skills/sidestep");
  assert.equal(view.querySelector("a.g-list-row .g-list-row__desc").textContent, "Skills", "a result says where it lives");
  assert.equal(document.activeElement, view.querySelector("#ref-query"));
  type("zzzz");
  assert.equal(view.querySelector(".g-ref-empty").textContent, "Nothing found. Try changing the search or filters.");
  assert.equal(view.querySelector(".g-ref-found"), null);
  type("");
  assert.equal(view.querySelectorAll(".g-ref-group").length, 4);
  assert.equal(view.querySelector(".g-ref-found"), null);
});

test("a query that finds more than fifty shows fifty and says so; a league card is found too", () => {
  open();
  type("block");
  assert.match(view.querySelector(".g-ref-found").textContent, /^Showing 50 of \d{3}$/);
  assert.equal(view.querySelectorAll("a.g-list-row").length, 50);
  assert.equal(view.querySelector(".g-ref-found").getAttribute("role"), "status");
  type("code of conduct");
  assert.equal(view.querySelector("a.g-list-row").getAttribute("href"), "#/overview/code-of-conduct");
  type("");
});

test("what is typed is what the reference remembers, and what it remembers is what the field shows", () => {
  open();
  type("dodge");
  assert.equal(refQuery(), "dodge");
  setRefQuery("");
  renderRef();
  assert.equal(view.querySelector("#ref-query").value, "", "the field is not left behind the memory");
});

test("typing in the band's search on another page lands on the reference with the query and the caret in the field", () => {
  open();
  view.querySelector("#ref-query").focus(); // the field of the last visit may still hold the focus: the draw must not leave it behind the memory
  globalThis.location = { hash: "#/weather" };
  setRefQuery("dodge"); // what wireRefSearch does before it calls goSearch
  goSearch("dodge");
  assert.equal(location.hash, "#/ref");
  renderRef();
  const input = view.querySelector("#ref-query");
  assert.equal(document.activeElement, input);
  assert.equal(input.value, "dodge");
  assert.equal(input.selectionStart, 5, "the caret stands after the last letter");
  assert.equal(input.selectionEnd, 5);
  assert.equal(takeSearchFocus(), false, "the draw took the flag");
  setRefQuery("");
});

test("an empty search does not move the coach anywhere", () => {
  globalThis.location = { hash: "#/weather" };
  goSearch("");
  assert.equal(location.hash, "#/weather");
  assert.equal(takeSearchFocus(), false);
});

test("a query is text wherever it is drawn back", () => {
  open();
  setRefQuery(HOSTILE);
  renderRef();
  assert.equal(view.querySelector("img"), null);
  assert.equal(view.querySelector("#ref-query").getAttribute("value"), HOSTILE);
  assertCspSafe(view);
  setRefQuery("");
});

test("no link the reference draws is one the router sends on", () => {
  open();
  assertNotSentOn(hrefsIn(view));
  type("a");
  assertNotSentOn(hrefsIn(view));
  type("");
});

test("the same groups in Russian, from the Russian dictionary", () => {
  open();
  useLocale("ru");
  renderRef();
  assert.equal(view.querySelector("h1").textContent, "Справочник");
  assert.equal(view.querySelector(".g-ref-group__title").textContent, "Перед матчем и в игре");
  assert.equal(view.querySelector("#ref-query").getAttribute("placeholder"), "Поиск команд, навыков, правил...");
  type("блок");
  assert.match(view.querySelector(".g-ref-found").textContent, /^Найдено: \d+$/);
  type("");
  useLocale("en");
});

test("leaving the reference unhooks its search, and coming back hooks it once", () => {
  open();
  releaseCurrentScreen();
  type("sidestep");
  assert.equal(refQuery(), "", "nothing hears the field after the screen is left");
  renderRef();
  renderRef();
  type("sidestep");
  assert.equal(refQuery(), "sidestep");
  assert.equal(view.listeners.get("input").length, 1, "drawn twice, heard once");
  type("");
});

test("the frame has no 2.x search strip left, and the shell draws no search bar", () => {
  for (const gone of ['id="ref-search"', 'id="global-search"']) assert.ok(!read("index.html").includes(gone), gone);
  assert.ok(!read("src/app.js").includes("global-search"));
  assert.ok(!read("src/shell/frame.css").includes(".g-searchbar"));
  assert.equal("showSearch" in shellModel({ route: { name: "ref", params: {} }, user: null }), false);
});

test("every reference sheet reaches the page, and every key of the frame is in both dictionaries", () => {
  const styles = read("src/styles.css");
  for (const sheet of ["ref.css", "prose.css"]) assert.ok(styles.includes(`@import url("screens/ref/${sheet}");`), sheet);
  assertDictionaryCovers("src/screens/ref/frame.mjs", "src/screens/ref/index.mjs");
});

// The frame the other reference screens are drawn in.

test("the table of contents names every group and lights exactly the item it is given", () => {
  const groups = refGroups(referenceData("en"));
  const fragment = draw(refTocMarkup(groups, "skills"));
  const toc = fragment.querySelector("nav.g-ref-toc");
  assert.equal(toc.getAttribute("aria-label"), "Reference sections");
  assert.deepEqual(fragment.querySelectorAll(".g-ref-toc__group").map((p) => p.textContent), ["Before and during a match", "Players", "Teams", "League"]);
  const current = fragment.querySelectorAll('a.g-ref-toc__link[aria-current="page"]');
  assert.deepEqual(current.map((link) => link.getAttribute("href")), ["#/ref/skills"]);
  assert.equal(current[0].querySelector(".g-ref-toc__count").textContent, "82");
  assert.equal(fragment.querySelector('a[href="#/weather"]').querySelector(".g-ref-toc__count"), null, "an article has no count");
  assert.equal(draw(refTocMarkup(groups)).querySelectorAll("[aria-current]").length, 0);
  assertCspSafe(fragment);
  assertStyled(fragment, "src/screens/ref/ref.css");
});

test("a page is one of four layouts, and only the index head is the page's h1", () => {
  for (const layout of ["index", "list", "article", "split"]) {
    const fragment = draw(refPageMarkup({ layout, screen: `test:${layout}`, headHtml: refHeadMarkup({ isIndex: layout === "index" }), mainHtml: "<p>text</p>" }));
    assert.ok(fragment.querySelector(`.g-ref.g-ref--${layout} .g-ref__body .g-ref__main`), layout);
    assert.equal(fragment.querySelector(".g-ref__panel"), null, `${layout}: no panel without one`);
    assert.equal(fragment.querySelectorAll("h1").length, layout === "index" ? 1 : 0, layout);
  }
  assert.throws(() => refPageMarkup({ layout: "nope", screen: "x", headHtml: "", mainHtml: "" }), /nope/);
  assert.throws(() => refPageMarkup({ layout: "index", headHtml: "", mainHtml: "" }), /names the screen/);
  const split = draw(refPageMarkup({ layout: "split", screen: "test:split", headHtml: "", tocHtml: '<nav class="g-ref-toc"></nav>', mainHtml: "<p>list</p>", panelHtml: "<p>card</p>" }));
  assert.deepEqual(split.querySelector(".g-ref__body").childNodes.map((node) => node.getAttribute("class")), ["g-ref-toc", "g-ref__main", "g-ref__panel"]);
});

test("the index is a screen: it starts at the top when it is opened, and a keystroke in its search or a language switch keeps the page", () => {
  withWindow({}, ({ scrolls, scrollPage }) => {
    view.innerHTML = "<p>elsewhere</p>";
    open();
    assert.equal(view.querySelector(".g-ref").getAttribute("data-screen"), "index");
    assert.deepEqual(scrolls, [[0, 0]], "from another screen");
    scrollPage(400);
    scrolls.length = 0;
    type("dodge");
    type("");
    useLocale("ru");
    renderRef();
    assert.deepEqual(scrolls, []);
    assert.equal(globalThis.scrollY, 400);
    useLocale("en");
  });
});

test("drawScreen starts the page over for another screen, and for that alone", () => {
  withWindow({}, ({ scrolls }) => {
    view.innerHTML = "<p>a screen of another module</p>";
    drawScreen(view, '<div data-screen="a">one</div>');
    assert.deepEqual(scrolls, [[0, 0]], "a screen that carries an identity replaces one that has none");
    drawScreen(view, '<div data-screen="a">two</div>');
    assert.deepEqual(scrolls, [[0, 0]], "the same screen with other content: the page stays");
    assert.equal(view.querySelector("[data-screen]").textContent, "two");
    drawScreen(view, '<div data-screen="b">three</div>');
    assert.deepEqual(scrolls, [[0, 0], [0, 0]]);
  });
  drawScreen(view, '<div data-screen="c">no window to scroll</div>');
  assert.equal(view.querySelector("[data-screen]").textContent, "no window to scroll", "without scrollTo (a test, a prerender) it only draws");
});

test("the head names the screen, the league and the search; off the index the title is a paragraph", () => {
  const index = draw(refHeadMarkup({ isIndex: true, query: "da<ng>er" }));
  assert.equal(index.querySelector("h1.g-ref-head__title").textContent, "Reference");
  assert.equal(index.querySelector(".g-ref-head__sub").textContent, "Gata League · Blood Bowl Sevens");
  const field = index.querySelector("#ref-query");
  assert.equal(field.getAttribute("value"), "da<ng>er");
  assert.equal(field.hasAttribute("data-search-all"), true);
  assert.equal(index.querySelector('label[for="ref-query"]').textContent, "Search the reference");
  const inner = draw(refHeadMarkup({ isIndex: false }));
  assert.equal(inner.querySelector("h1"), null);
  assert.equal(inner.querySelector("p.g-ref-head__title").textContent, "Reference");
  assertCspSafe(inner);
  assertStyled(inner, "src/screens/ref/ref.css", "search-field.css");
});

test("the way back is a link with an arrow and a name; the name is text", () => {
  const link = draw(backLinkMarkup({ href: "#/ref/skills", label: HOSTILE })).querySelector("a.g-ref-back");
  assert.equal(link.getAttribute("href"), "#/ref/skills");
  assert.ok(link.querySelector("svg"));
  assert.equal(link.textContent, HOSTILE);
});

test("the search field is wired by its attribute, and unwires", () => {
  const fragment = draw(refHeadMarkup({ isIndex: true }));
  const heard = [];
  const release = wireRefSearch(fragment, { onQuery: (value) => heard.push(value) });
  const input = fragment.querySelector("#ref-query");
  input.value = "kick";
  fireEvent(input, "input");
  assert.deepEqual(heard, ["kick"]);
  assert.equal(refQuery(), "kick");
  release();
  input.value = "kick-off";
  fireEvent(input, "input");
  assert.deepEqual(heard, ["kick"]);
  setRefQuery("");
});

// The sheet: what the brief fixes, and what the 2.x globals would otherwise decide.

const SHEET = "src/screens/ref/ref.css";

test("the head is the index's up to 900px and a band from 901px, the title 32px in the display face", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-head", "display"), ["none"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--index .g-ref-head", "display"), ["flex"]);
  // The band's rule names the page too, or the index's own (0,2,0) would keep the phone's column on a desktop.
  assert.deepEqual(valuesOf(SHEET, ".g-ref .g-ref-head", "display"), ["grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref .g-ref-head", "background"), ["var(--surface)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref .g-ref-head", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref .g-ref-head", "grid-template-columns"), ["minmax(max-content, 1fr) minmax(0, 420px)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-head__title", "font"), ["700 32px/1 var(--font-display)"]);
});

test("the table of contents is the desktop's: 48px links, the current one on the surface in bold", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc", "display"), ["none", "flex"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc", "flex"), ["1 1 220px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc", "max-width"), ["260px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc__link", "min-height"), ["48px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc__link", "border-radius"), ["var(--radius-sm)"]);
  assert.deepEqual(valuesOf(SHEET, '.g-ref-toc__link[aria-current="page"]', "background"), ["var(--surface)"]);
  assert.deepEqual(valuesOf(SHEET, '.g-ref-toc__link[aria-current="page"]', "font-weight"), ["700"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc__group", "font"), ["700 12px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc__group", "text-transform"), ["uppercase"]);
});

test("the way back is a 44px link on a phone and gone on a desktop", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-back", "min-height"), ["44px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-back", "font"), ["600 14px/1.2 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-back", "color"), ["var(--accent-text)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-back", "display"), ["inline-flex", "none"]);
});

test("the index is a column on a phone and two columns of groups from 901px", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-groups", "display"), ["flex", "grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-groups", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-group__title", "font"), ["700 13px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-group__title", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-group__title", "letter-spacing"), [".08em"]);
});

test("the sheet breaks at 900/901 only, gives the screen its edge-to-edge band, and sets the case wherever it sets a font", () => {
  const css = read(SHEET).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, query] of css.matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  // The band goes out over the frame's padding (stage 13, pre-flight L3), which the page no longer gives up.
  assert.deepEqual(valuesOf(SHEET, "#app-view:has(> .g-ref)", "padding"), []);
  assert.deepEqual(valuesOf(SHEET, ".g-ref .g-ref-head", "margin"), ["calc(-1 * var(--view-top)) calc(-1 * var(--view-side)) var(--space-24)"]);
  for (const { selectors, body } of blocks(css)) {
    if (/(?:^|[;\s])font\s*:/.test(body)) assert.match(body, /text-transform\s*:/, `${selectors}: a font without its case`);
  }
});

test("the head, the groups and the table of contents are readable in every palette", () => {
  assertReadable(SHEET, ".g-ref-head__sub", "color", ["--page", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-head__title", "color", ["--page", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-group__title", "color", ["--page", "--desk", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-found", "color", ["--page", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-empty", "color", ["--page", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-back", "color", ["--page", "--desk"], 4.5);
  assertReadable(SHEET, ".g-ref-toc__group", "color", ["--desk"], 4.5);
  assertReadable(SHEET, ".g-ref-toc__link", "color", ["--desk"], 4.5);
  assertReadable(SHEET, '.g-ref-toc__link[aria-current="page"]', "color", ["--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-toc__count", "color", ["--desk", "--surface"], 4.5);
});

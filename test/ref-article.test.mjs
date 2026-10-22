import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale, withWindow } from "./helpers/ref-screen.mjs";

const view = mountView();
const { articleBody, articleMarkup, findPage, kickerOf, notFoundMarkup, parentOf, renderLegal, renderOverviewArticle, renderReferencePage } = await import("../src/screens/ref/article.mjs");
const { refGroups } = await import("../src/screens/ref/catalog.mjs");
const { activeOverviewCards } = await import("../src/screens/overview.mjs");
const { refQuery, setRefQuery } = await import("../src/screens/ref/memory.mjs");
const { renderRefSection } = await import("../src/screens/ref/list.mjs");
const { renderRef } = await import("../src/screens/ref/index.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { t } = await import("../src/core/i18n.mjs");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const draw = (markup) => parseHtml(document, markup);
const type = (value) => { const input = view.querySelector("#ref-query"); input.value = value; fireEvent(input, "input"); };

// Every article starts as a coach finds it on arrival: English, nothing typed, and a season that has been read
// (a team's article reads the season when it opens; here none goes to the network).
beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  setRefQuery("");
  state.season = { data: { standings: [] }, loaded: true, loading: false, error: "" };
});

test("every page of both vaults draws as an article: one h1, its title, nothing the CSP refuses", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    for (const page of state.data.pages) {
      renderReferencePage(page.slug);
      assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), [page.title], `${locale}: ${page.slug}`);
      assertCspSafe(view);
    }
  }
  useLocale("en");
});

test("a short slug finds its page as in 2.x: #/block is skills/block", () => {
  renderReferencePage("block");
  assert.equal(view.querySelector("h1").textContent, "Block");
});

test("an address with no page is told so, with the way back to the reference", () => {
  renderReferencePage("no-such-page");
  assert.equal(view.querySelector("h1").textContent, "Page not found.");
  assert.ok(view.querySelector('a[href="#/ref"]'));
});

test("an article of a group pages to its neighbours, and lights itself in the table of contents", () => {
  renderReferencePage("casualties");
  assert.equal(view.querySelector(".g-article__prev").getAttribute("href"), "#/prayers-to-nuffle");
  assert.equal(view.querySelector(".g-article__next").getAttribute("href"), "#/player-advancement");
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]').getAttribute("href"), "#/casualties");
  assert.equal(view.querySelector(".g-article__kicker").textContent, "Before and during a match · league reference");
  renderReferencePage("weather");
  assert.equal(view.querySelector(".g-article__prev"), null);
});

test("the way back from a list member is its list; from an article, the reference", () => {
  const back = (slug) => { renderReferencePage(slug); const link = view.querySelector(".g-ref-back"); return [link.getAttribute("href"), link.textContent.trim()]; };
  assert.deepEqual(back("inducements/bribe"), ["#/ref/inducements", "Inducements"]);
  assert.deepEqual(back("weather"), ["#/ref", "Reference"]);
});

test("the build's table classes reach the page inside the prose frame", () => {
  renderReferencePage("weather");
  assert.ok(view.querySelector(".g-prose .table-scroll table.fit-table td.fit-cell.center-cell"));
});

test("an overview card is an article of the league rules; one that is not there is not found", () => {
  renderOverviewArticle("code-of-conduct");
  assert.equal(view.querySelector("h1").textContent, "Code Of Conduct");
  assert.equal(view.querySelector(".g-ref-back").getAttribute("href"), "#/ref/rules");
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]').getAttribute("href"), "#/ref/rules");
  assert.ok(view.querySelectorAll(".g-prose li").length > 3);
  renderOverviewArticle("nope");
  assert.equal(view.querySelector("h1").textContent, "Page not found.");
});

test("the legal page is an article of the reference", () => {
  renderLegal();
  assert.equal(view.querySelector("h1").textContent, "Legal Information");
  assert.equal(view.querySelectorAll(".g-prose p").length, 3);
});

test("no link an article's frame draws is sent on by the router; the 2.x screens are gone", () => {
  for (const slug of ["weather", "teams/human", "inducements/bribe"]) { renderReferencePage(slug); assertNotSentOn(hrefsIn(view)); }
  for (const file of ["src/screens/detail.mjs", "src/screens/legal.mjs", "src/components/cards.mjs"]) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  assert.ok(readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").includes('@import url("screens/ref/article.css");'));
  assertDictionaryCovers("src/screens/ref/article.mjs");
});

// What the brief leaves to the screen.

test("a page is found by its own slug before any slug that merely ends with it", () => {
  const pages = [{ slug: "skills/block", title: "Block" }, { slug: "block", title: "Block (page)" }, { slug: "teams/human", title: "Human" }];
  assert.equal(findPage({ pages }, "block").title, "Block (page)");
  assert.equal(findPage({ pages }, "human").title, "Human", "only the last segment, as in 2.x: teams/human is #/human");
  assert.equal(findPage({ pages }, "uman"), null, "a slug that ends with the letters but not with the segment is not it");
  assert.equal(findPage({ pages }, ""), null);
  assert.equal(findPage({}, "block"), null, "a vault with no pages has no page");
});

test("an address that is not a page is not echoed: the article says only that it is not found", () => {
  renderReferencePage(HOSTILE);
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Page not found."]);
  assert.equal(view.querySelector("img"), null);
  assert.ok(!view.textContent.includes("Grak"));
  assertCspSafe(view);
  useLocale("ru");
  renderReferencePage("no-such-page");
  assert.equal(view.querySelector("h1").textContent, "Страница не найдена.");
});

test("not found keeps the reference around it: the head, the table of contents, nothing lit", () => {
  renderReferencePage("no-such-page");
  assert.ok(view.querySelector(".g-ref--article header.g-pagehead"));
  assert.equal(view.querySelectorAll(".g-ref-toc__link").length, refGroups(referenceData("en")).flatMap((group) => group.items).length);
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]'), null);
  assert.equal(view.querySelector(".g-article__kicker"), null, "there is no group to name");
  assert.equal(view.querySelector(".g-article__pager"), null);
  assert.equal(draw(notFoundMarkup()).querySelectorAll("h1").length, 1);
});

test("an article is the page's one h1; the band above it keeps its title as a paragraph", () => {
  renderReferencePage("weather");
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Weather"]);
  assert.equal(view.querySelector(".g-pagehead__title").tagName, "P");
  assert.ok(view.querySelector(".g-ref--article .g-ref__body .g-ref-toc"));
  assert.ok(view.querySelector(".g-ref__main article.g-article"));
});

test("the kicker names the group and the section; a list member, a group page and any other page differ", () => {
  const pages = referenceData("en").pages;
  const kicker = (slug) => kickerOf(pages.find((page) => page.slug === slug));
  assert.equal(kicker("teams/human"), "Teams · Team's Rules");
  assert.equal(kicker("skills/block"), "Players · Skills");
  assert.equal(kicker("inducements/bribe"), "Before and during a match · Inducements");
  assert.equal(kicker("rotten-rick-bupkeis"), "Teams · Star Players");
  assert.equal(kicker(pages.find((page) => page.kind === "rules").slug), "League · League Rules");
  assert.equal(kicker("weather"), "Before and during a match · league reference");
  assert.equal(kicker("skill-table"), "Players · league reference");
  assert.equal(kicker("all-gata-changes"), "League · league reference");
  assert.equal(kicker("reference-sources"), "Reference", "a page the groups do not name has no group to say");
  assert.equal(kickerOf({ kind: "cheatsheet", id: "x" }), "Cheatsheets", "a section no group names is only itself");
  useLocale("ru");
  assert.equal(kickerOf(referenceData("ru").pages.find((page) => page.slug === "teams/human")), "Команды · Правила команд");
  assert.equal(kickerOf(referenceData("ru").pages.find((page) => page.slug === "weather")), "Перед матчем и в игре · справочник лиги");
});

test("the way up from a page is the list it is a member of, or the reference", () => {
  assert.deepEqual(parentOf({ kind: "team", id: "x" }), { href: "#/ref/teams", label: "Team's Rules" });
  assert.deepEqual(parentOf({ kind: "starPlayer", id: "x" }), { href: "#/ref/star-players", label: "Star Players" });
  assert.deepEqual(parentOf({ kind: "page", id: "x" }), { href: "#/ref", label: "Reference" });
  assert.deepEqual(parentOf({ id: "x" }), { href: "#/ref", label: "Reference" });
  useLocale("ru");
  assert.deepEqual(parentOf({ kind: "team", id: "x" }), { href: "#/ref/teams", label: "Правила команд" });
});

test("a team, a skill, a star player and a rule are lit in the table of contents by their list", () => {
  const lit = (slug) => { renderReferencePage(slug); return view.querySelector('.g-ref-toc [aria-current="page"]')?.getAttribute("href") ?? null; };
  assert.equal(lit("teams/human"), "#/ref/teams");
  assert.equal(lit("skills/block"), "#/ref/skills");
  assert.equal(lit("rotten-rick-bupkeis"), "#/ref/star-players");
  assert.equal(lit("skill-table"), "#/skill-table");
  assert.equal(lit("reference-sources"), null, "a page the groups do not name lights nothing");
});

test("the pager has an end for each end: the first article has only a next, the last only a previous", () => {
  renderReferencePage("weather");
  assert.equal(view.querySelector(".g-article__next").getAttribute("href"), "#/kick-off-table");
  assert.equal(view.querySelector(".g-article__next").textContent, "Kick-off Table");
  assert.equal(view.querySelector(".g-article__pager").getAttribute("aria-label"), "More articles");
  renderReferencePage("all-gata-changes");
  assert.ok(view.querySelector(".g-article__prev"));
  assert.equal(view.querySelector(".g-article__next"), null);
  useLocale("ru");
  renderReferencePage("casualties");
  assert.equal(view.querySelector(".g-article__pager").getAttribute("aria-label"), "Другие статьи");
});

test("a page outside the groups, and every member of a list, has no pager", () => {
  for (const slug of ["reference-sources", "gata-blood-bowl-league", "teams/human", "skills/block", "inducements/bribe", "rotten-rick-bupkeis"]) {
    renderReferencePage(slug);
    assert.equal(view.querySelector(".g-article__pager"), null, slug);
  }
  renderOverviewArticle("code-of-conduct");
  assert.equal(view.querySelector(".g-article__pager"), null);
});

test("a title a person could have typed is text wherever an article draws it", () => {
  const weather = { id: "general-information-weather", title: HOSTILE, slug: "weather", html: "", text: HOSTILE };
  const kickoff = { id: "general-information-kick-off-table", title: HOSTILE, slug: "kick-off-table", html: "", text: HOSTILE };
  const data = { pages: [weather, kickoff] };
  const fragment = draw(articleMarkup({ data, page: kickoff, groups: refGroups(data) }));
  assert.equal(fragment.querySelector("h1").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-article__prev").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-prose p").textContent, HOSTILE, "a page with no html is its text, as text");
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

test("the body is the page's own html in the prose frame, or its text when it has no html", () => {
  assert.match(articleBody({ html: "<h3>Spring</h3>", text: "x" }), /^<div class="g-prose"><h3>Spring<\/h3><\/div>$/);
  assert.equal(articleBody({ html: "", text: "a < b" }), '<div class="g-prose"><p>a &lt; b</p></div>');
});

test("an overview card is a heading and a list for each of its sections; an item written 'Label: text' keeps its label in strong", () => {
  renderOverviewArticle("code-of-conduct");
  const sections = view.querySelectorAll(".g-prose section");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].querySelectorAll("h2").length, 1);
  assert.equal(view.querySelectorAll(".g-prose section ul li").length, 7);
  assert.equal(view.querySelector(".g-prose li strong"), null, "a sentence with no label is only text");
  assert.equal(view.querySelector(".g-article__kicker").textContent, "League Rules");
  assert.equal(view.querySelectorAll("h1").length, 1);
  assertCspSafe(view);
  renderOverviewArticle("general-rules");
  const labelled = view.querySelector(".g-prose li strong");
  assert.match(labelled.textContent, /^[^:]{2,42}:$/);
  assert.ok(labelled.parentNode.textContent.length > labelled.textContent.length, "the text follows its label");
});

test("every overview card of both languages draws as an article with a section for each of its own", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    for (const card of activeOverviewCards()) {
      renderOverviewArticle(card.slug);
      assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), [card.title], `${locale}: ${card.slug}`);
      assert.equal(view.querySelectorAll(".g-prose section").length, card.sections.length, `${locale}: ${card.slug}`);
      assertCspSafe(view);
    }
  }
  useLocale("en");
});

test("the legal page has its subtitle under the title, three paragraphs in the prose, and the way back to the reference", () => {
  renderLegal();
  assert.equal(view.querySelector(".g-article__sub").textContent, "Unofficial fan-made reference for a private Blood Bowl league.");
  assert.equal(view.querySelector(".g-ref-back").getAttribute("href"), "#/ref");
  assert.deepEqual(view.querySelectorAll(".g-prose p").map((p) => p.textContent), [t("legal.paragraph1"), t("legal.paragraph2"), t("legal.paragraph3")]);
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]'), null);
  assertCspSafe(view);
  useLocale("ru");
  renderLegal();
  assert.equal(view.querySelector("h1").textContent, "Юридическая информация");
});

test("the search of the band, on an article, takes the coach to the reference with what was typed", () => {
  renderReferencePage("weather");
  globalThis.location = { hash: "#/weather" };
  type("dodge");
  assert.equal(refQuery(), "dodge");
  assert.equal(location.hash, "#/ref");
  assert.equal(view.querySelector("h1").textContent, "Weather", "the article itself is not touched by the band");
});

test("leaving an article unhooks its search, and drawing one after another hooks it once", () => {
  renderReferencePage("weather");
  releaseCurrentScreen();
  globalThis.location = { hash: "#/weather" };
  type("dodge");
  assert.equal(refQuery(), "", "nothing hears the field after the screen is left");
  renderReferencePage("weather");
  renderReferencePage("casualties");
  renderOverviewArticle("code-of-conduct");
  renderLegal();
  assert.equal(view.listeners.get("input").length, 1, "one listener for the band, however many articles were drawn");
  assert.equal(view.listeners.get("click")?.length ?? 0, 0, "the pager is a plain link: nothing listens for its clicks");
  type("dodge");
  assert.equal(refQuery(), "dodge");
});

test("an article opened from a list, the index, a search result or the pager starts at its top; the same article drawn again stays where it is", () => {
  withWindow({}, ({ scrolls, scrollPage }) => {
    const from = (screen) => {
      screen();
      scrollPage(700);
      scrolls.length = 0;
    };
    from(() => renderRefSection("inducements"));
    renderReferencePage("inducements/assistant-coaches");
    assert.equal(view.querySelector("h1").textContent, "Assistant Coaches");
    assert.deepEqual(scrolls, [[0, 0]], "a row of a list");
    from(() => renderRef());
    renderReferencePage("weather");
    assert.deepEqual(scrolls, [[0, 0]], "a row of the index or of a search result");
    scrollPage(700);
    scrolls.length = 0;
    renderReferencePage("weather");
    useLocale("ru");
    renderReferencePage("weather");
    assert.deepEqual(scrolls, [], "a redraw, and the other language, keep the page");
    assert.equal(globalThis.scrollY, 700);
    useLocale("en");
    const next = view.querySelector(".g-article__next").getAttribute("href").slice(2);
    renderReferencePage(next);
    assert.deepEqual(scrolls, [[0, 0]], "the pager's next article, however it was reached: at its own top, also when the coach comes back to the one before");
    scrollPage(700);
    scrolls.length = 0;
    renderOverviewArticle("code-of-conduct");
    renderLegal();
    renderReferencePage("nothing-here");
    assert.deepEqual(scrolls, [[0, 0], [0, 0], [0, 0]], "a card of the league overview, the legal page and an address with no page are articles of their own");
    from(() => renderReferencePage("nothing-here"));
    renderReferencePage("nothing-here");
    renderReferencePage("nothing-else");
    assert.deepEqual(scrolls, [[0, 0]], "and an address with no page is that address: the same one stays, another starts over");
  });
});

test("the dictionary has the kicker and the pager's name in both languages", () => {
  assert.equal(t("ref.kicker", { group: "Players" }), "Players · league reference");
  assert.equal(t("ref.pager"), "More articles");
  useLocale("ru");
  assert.equal(t("ref.kicker", { group: "Игроки" }), "Игроки · справочник лиги");
  assert.equal(t("ref.pager"), "Другие статьи");
});

test("the markup an article draws is styled by the reference's sheets", () => {
  renderReferencePage("casualties");
  assertStyled(view, "src/screens/ref/ref.css", "page-head.css", "src/screens/ref/article.css", "src/screens/ref/prose.css", "search-field.css");
  renderOverviewArticle("code-of-conduct");
  assertStyled(view, "src/screens/ref/ref.css", "page-head.css", "src/screens/ref/article.css", "src/screens/ref/prose.css", "search-field.css");
  renderLegal();
  assertStyled(view, "src/screens/ref/ref.css", "page-head.css", "src/screens/ref/article.css", "src/screens/ref/prose.css", "search-field.css");
});

test("the router draws these screens, and the 2.x detail, legal and not-found screens are gone from src", () => {
  const router = read("src/core/router.mjs");
  assert.match(router, /overview: \(\{ slug \}\) => renderOverviewArticle\(slug\),/);
  assert.match(router, /legal: \(\) => renderLegal\(\),/);
  assert.match(router, /page: \(\{ slug \}\) => renderReferencePage\(slug\),/);
  for (const gone of ["findPageBySlug", "renderNotFound", "renderDetail", "renderOverviewDetail", "setActiveNav", "setViewSection"]) assert.ok(!router.includes(gone), gone);
  const files = readdirSync(new URL("../src", import.meta.url), { recursive: true }).filter((file) => /\.(mjs|js|css)$/.test(file));
  for (const file of files) {
    assert.ok(!/screens\/detail|screens\/legal|components\/cards|renderOverviewDetail/.test(read(`src/${file}`)), `src/${file} still names a screen that is gone`);
  }
});

test("the league overview keeps its cards as data: the finders stay, the drawing left", () => {
  const overview = read("src/screens/overview.mjs");
  assert.match(overview, /export function activeOverviewCards\(/);
  assert.match(overview, /export function findOverviewCard\(/);
  assert.ok(!overview.includes("renderOverviewDetail"));
  assert.ok(!overview.includes("page-chrome"));
});

// The sheet: what the brief fixes, and what the 2.x globals would otherwise decide.

const SHEET = "src/screens/ref/article.css";

/** The part of the sheet that is for 901px and up, and the part that is not. */
function split(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const wide = bare.match(/@media\s*\(min-width: 901px\)\s*\{([\s\S]*)\n\}/)?.[1] ?? "";
  return { wide, rest: bare.replace(wide, "") };
}

test("up to 900px an article has no frame; from 901px it is a card of the surface, 16px round, in the ring", () => {
  const { wide, rest } = split(read(SHEET));
  for (const property of ["box-shadow", "padding"]) {
    assert.ok(!new RegExp(`\\.g-article\\s*\\{[^}]*\\b${property}\\s*:`).test(rest), `.g-article has no ${property} on a phone`);
  }
  assert.ok(!/\.g-article\s*\{[^}]*\bbackground\s*:\s*var\(--surface\)/.test(rest), "a phone's article has no card");
  assert.match(wide, /\.g-article\s*\{[^}]*padding:\s*32px 40px;/);
  assert.match(wide, /\.g-article\s*\{[^}]*border-radius:\s*var\(--radius-2xl\);/);
  assert.match(wide, /\.g-article\s*\{[^}]*background:\s*var\(--surface\);/);
  assert.match(wide, /\.g-article\s*\{[^}]*box-shadow:\s*var\(--ring\);/);
});

test("the ring is the strong line, and what sits on the card is readable on it in every palette", () => {
  assert.equal(read("src/styles/tokens.css").match(/--ring:\s*([^;]+);/)[1], "inset 0 0 0 1px var(--line-strong)");
  assertReadable(SHEET, ".g-article__kicker", "color", ["--surface", "--page"], 4.5);
  assertReadable(SHEET, ".g-article__title", "color", ["--surface", "--page"], 4.5);
  assertReadable(SHEET, ".g-article__sub", "color", ["--surface", "--page"], 4.5);
  assertReadable(SHEET, ".g-article__prev", "color", ["--surface", "--page"], 4.5);
  assertReadable(SHEET, ".g-article__next", "color", ["--surface", "--page"], 4.5);
});

test("the kicker is 700 12px in capitals spaced .08em; the title 700 32px, 44px from 901px, in the display face and never in capitals", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-article__kicker", "font"), ["700 12px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-article__kicker", "letter-spacing"), [".08em"]);
  assert.deepEqual(valuesOf(SHEET, ".g-article__kicker", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(SHEET, ".g-article__title", "font"), ["700 32px/1 var(--font-display)", "700 44px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-article__title", "text-transform"), ["none", "none"], "on the phone's rule and on the desktop's");
  assert.deepEqual(valuesOf(SHEET, ".g-article__title", "letter-spacing"), ["0", "0"]);
  assert.ok(split(read(SHEET)).wide.includes("700 44px/1 var(--font-display)"), "the 44px title is the desktop's");
});

test("the pager's links are 44px tall, 600 15px in the accent; the arrows are drawn by the sheet", () => {
  for (const side of ["prev", "next"]) {
    assert.deepEqual(valuesOf(SHEET, `.g-article__${side}`, "min-height"), ["44px"], side);
    assert.deepEqual(valuesOf(SHEET, `.g-article__${side}`, "font"), ["600 15px/1.3 var(--font-body)"], side);
    assert.deepEqual(valuesOf(SHEET, `.g-article__${side}`, "color"), ["var(--accent-text)"], side);
  }
  assert.deepEqual(valuesOf(SHEET, ".g-article__pager", "border-top"), ["1px solid var(--line)"]);
  assert.ok(valuesOf(SHEET, ".g-article__prev::before", "content").length >= 1);
  assert.ok(valuesOf(SHEET, ".g-article__next::after", "content").length >= 1);
});

test("from 901px the content stands at most 820px wide inside the card", () => {
  const { wide } = split(read(SHEET));
  assert.match(wide, /max-width:\s*820px/);
});

test("from 901px an article is columns that never wrap: the contents as wide as a list's, the card the rest", () => {
  assert.deepEqual(valuesOf("src/screens/ref/ref.css", ".g-ref--list .g-ref__body", "grid-template-columns"), ["clamp(140px, 14vw, 220px) minmax(0, 1fr)"], "a list's contents column, which the article keeps");
  assert.deepEqual(valuesOf(SHEET, ".g-ref--article .g-ref__body", "display"), ["grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--article .g-ref__body", "grid-template-columns"), ["clamp(140px, 14vw, 220px) minmax(0, 1fr)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--article .g-ref__body", "align-items"), ["start"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--article .g-ref__body", "flex-flow"), [], "not a wrapping row");
  assert.ok(split(read(SHEET)).wide.includes(".g-ref--article .g-ref__body"), "the columns are the desktop's");
});

test("the prose does not open with a margin of its own, and no .g-prose is inside a .content-panel", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-article .g-prose > :first-child", "margin-top"), ["0"]);
  assert.ok(!/content-panel/.test(read("src/screens/ref/article.mjs")), "the 2.x panel would out-specify the prose tables");
});

/**
 * The frame every reference screen is drawn in: a head with the title and the search, the table of
 * contents beside the content, the way back on a phone, and the page that holds them in one of four
 * layouts. The index (`index.mjs`) is the first screen to wear it; the lists and the articles follow.
 *
 * Markup only, plus the one listener the search needs. What goes in the head's field is the reference's
 * (`memory.mjs`): typing on the index narrows the index, typing on any other screen takes the coach
 * to the index with what was typed.
 */
import { delegate, escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { refUrl } from "../../core/routes.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderSearchField } from "../../ui/search-field.mjs";
import { askSearchFocus, setRefQuery } from "./memory.mjs";

const LAYOUTS = new Set(["index", "list", "article", "split"]);

/** A count of zero is a count; only no count at all draws no number. */
const hasCount = (count) => count !== "" && count !== null && count !== undefined;

/**
 * The title, the league's name and the search. The index owns the page's one `h1`; on every other
 * screen the article or the list has it, and the title here is a paragraph.
 *
 * @param {{isIndex?: boolean, query?: string}} [props] `query`: what the field already holds
 */
export function refHeadMarkup({ isIndex = false, query = "" } = {}) {
  const tag = isIndex ? "h1" : "p";
  const field = renderSearchField({ id: "ref-query", label: t("ref.search"), placeholder: t("search.placeholder"), value: query, data: { searchAll: "" } });
  return `<header class="g-ref-head">`
    + `<${tag} class="g-ref-head__title">${escapeHtml(t("shell.tab.ref"))}</${tag}>`
    + `<p class="g-ref-head__sub">${escapeHtml(`${t("shell.league")} · ${t("shell.leagueSub")}`)}</p>`
    + `${field}</header>`;
}

function tocLink(item, currentKey) {
  assertLinkHref(item.href);
  const count = hasCount(item.count) ? `<span class="g-ref-toc__count">${escapeHtml(item.count)}</span>` : "";
  const current = item.key === currentKey ? ' aria-current="page"' : "";
  return `<a class="g-ref-toc__link" href="${escapeHtml(item.href)}"${current}>${escapeHtml(item.title)}${count}</a>`;
}

/**
 * The table of contents: each group's name and, under it, its items; the one whose key is `currentKey`
 * is the page the coach is on.
 *
 * @param {{title: string, items: {key: string, title: string, href: string, count: string|number}[]}[]} groups as catalog.mjs `refGroups` gives them
 * @param {string|null} [currentKey]
 */
export function refTocMarkup(groups, currentKey = null) {
  const parts = groups.map((group) => `<p class="g-ref-toc__group">${escapeHtml(group.title)}</p>${group.items.map((item) => tocLink(item, currentKey)).join("")}`);
  return `<nav class="g-ref-toc" aria-label="${escapeHtml(t("ref.toc"))}">${parts.join("")}</nav>`;
}

/** The way back up, for a phone, which has no table of contents to go by. */
export function backLinkMarkup({ href, label }) {
  assertLinkHref(href);
  return `<a class="g-ref-back" href="${escapeHtml(href)}">${icon("back", 18)}<span>${escapeHtml(label)}</span></a>`;
}

/**
 * A reference page: the head, then the table of contents, the content and, on a screen that has one,
 * the panel beside it. `layout` names what the page is — the index, a list, an article, a list with
 * the card of its chosen item — and is a class the stylesheet lays the parts out by.
 *
 * `open` says an item of a split page is chosen: a phone shows the list or the panel, not both, and
 * shows the panel then (`g-ref--open`).
 *
 * `headHtml`, `tocHtml`, `mainHtml` and `panelHtml` are markup from the render…() functions above and
 * the screens'.
 */
export function refPageMarkup({ layout, open = false, headHtml, tocHtml = "", mainHtml, panelHtml = "" }) {
  if (!LAYOUTS.has(layout)) throw new Error(`a reference page is one of ${[...LAYOUTS].join(", ")}, not ${JSON.stringify(layout)}`);
  const panel = panelHtml ? `<aside class="g-ref__panel">${panelHtml}</aside>` : "";
  return `<div class="g-ref g-ref--${layout}${open ? " g-ref--open" : ""}">${headHtml}<div class="g-ref__body">${tocHtml}<div class="g-ref__main">${mainHtml}</div>${panel}</div></div>`;
}

/**
 * Hear the head's field under `root`: what is typed is remembered, then handed to `onQuery`.
 * @returns {() => void} stops listening
 */
export function wireRefSearch(root, { onQuery }) {
  return delegate(root, "input", "[data-search-all]", (event, field) => {
    setRefQuery(field.value);
    onQuery(field.value);
  });
}

/**
 * The search of a screen that is not the index: a query takes the coach to the index, with the caret
 * in the field to go on typing. An empty field goes nowhere.
 */
export function goSearch(value) {
  if (!String(value ?? "").trim()) return;
  askSearchFocus();
  location.hash = refUrl();
}

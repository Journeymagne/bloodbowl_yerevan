/**
 * The reference (`#/ref`): the four groups it is kept in — what a match needs, the players, the
 * teams, the league — each a list of links to a page or to a list, and over them the one search
 * for everything the reference holds. Typing replaces the groups with what matches, a row for each,
 * and says how many there are; clearing the field brings the groups back.
 *
 * The query is the reference's (`memory.mjs`), so it survives going into an article and back, and a
 * screen that has no index of its own can hand its coach here with the field ready to type in.
 */
import { escapeHtml, patch } from "../../core/dom.mjs";
import { getLocale, t } from "../../core/i18n.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { renderNavRow } from "../../ui/list-row.mjs";
import { activeOverviewCards } from "../overview.mjs";
import { refGroups } from "./catalog.mjs";
import { refHeadMarkup, refPageMarkup, wireRefSearch } from "./frame.mjs";
import { refQuery, takeSearchFocus } from "./memory.mjs";
import { normalizeText, searchReference } from "./search.mjs";

/** How many results are drawn; a search that finds more says so. */
const RESULT_LIMIT = 50;

function groupsMarkup(data, overviewCards) {
  const groups = refGroups(data, { overviewCount: overviewCards.length }).map((group) => {
    const rows = group.items.map((item) => renderNavRow({ href: item.href, title: item.title, desc: item.desc, count: item.count }));
    return `<section class="g-ref-group"><h2 class="g-ref-group__title">${escapeHtml(group.title)}</h2>${rows.join("")}</section>`;
  });
  return `<div class="g-ref-groups">${groups.join("")}</div>`;
}

function resultsMarkup(data, overviewCards, query) {
  const { total, results } = searchReference({ data, overviewCards, query, limit: RESULT_LIMIT, locale: getLocale() });
  if (!total) return `<div class="g-ref-results"><p class="g-ref-empty" role="status">${escapeHtml(t("section.emptyState"))}</p></div>`;
  const found = total > results.length ? t("ref.foundFirst", { shown: results.length, count: total }) : t("ref.found", { count: total });
  const rows = results.map((result) => renderNavRow({ href: result.href, title: result.title, desc: result.caption }));
  return `<div class="g-ref-results"><p class="g-ref-found" role="status">${escapeHtml(found)}</p>${rows.join("")}</div>`;
}

/**
 * @param {{data: object, overviewCards: object[], query: string}} props `data` the content vault of the
 *   language, `overviewCards` the league overview's cards of that language, `query` what is in the field
 */
export function refIndexMarkup({ data, overviewCards, query }) {
  const searching = normalizeText(query) !== "";
  return refPageMarkup({
    layout: "index",
    headHtml: refHeadMarkup({ isIndex: true, query }),
    mainHtml: searching ? resultsMarkup(data, overviewCards, query) : groupsMarkup(data, overviewCards),
  });
}

/** The index as the page and the memory have it. The field shows the query even when it holds the focus, which `patch` leaves alone. */
function redraw() {
  patch(view, refIndexMarkup({ data: state.data, overviewCards: activeOverviewCards(), query: refQuery() }));
  const field = view.querySelector("#ref-query");
  if (field.value !== refQuery()) field.value = refQuery();
  return field;
}

let releaseSearch = null;

export function renderRef() {
  const field = redraw();
  // Once per visit: typing redraws through `redraw`, and only the router comes back here.
  if (!releaseSearch) {
    releaseSearch = wireRefSearch(view, { onQuery: redraw });
    onScreenLeave("ref:search", () => {
      releaseSearch?.();
      releaseSearch = null;
    });
  }
  if (takeSearchFocus()) {
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }
}

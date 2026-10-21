/**
 * The lists of the matches page under the card (Matches.html): «Results» — the season's finished matches, the newest
 * first, the record in its head — and «Later in the season» — the team's other open matches, then the next round, whose
 * opponent the Swiss pairing gives once every result of the round is in.
 *
 * A phone's result row is one link, to the match, as the overview's rows are (spec §3; pre-flight L14: three links in a
 * row give no thumb 44px); the opponent and the race are text in it.
 *
 * A desk has «Calendar» instead (DeskSeason.html): every played match of the season with its result's square, the match
 * on, the team's other open matches (their lines lead to the match), and the next round, «Friendlies» in its head and the
 * way to the league's calendar at its foot (stage 10, pre-flight L11).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { seasonTabUrl, teamUrl } from "../../core/routes.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderResultPill, resultLabels } from "../../ui/result-pill.mjs";

/** A row's body: the pill, the opponent over the round, race and casualties, the MVP; the score at the end. */
function resultBody({ result, opponent, line, mvp, score }) {
  return `${renderResultPill({ result })}<span class="g-matches__text"><span class="g-matches__opponent">${escapeHtml(opponent)}</span>`
    + `<span class="g-matches__line">${escapeHtml(line)}</span>${mvp ? `<span class="g-matches__line">${escapeHtml(mvp)}</span>` : ""}</span>`
    + `<span class="g-matches__score">${escapeHtml(score)}</span>`;
}

/** One finished match: a link to the match. */
function resultRow(row) {
  assertLinkHref(row.href);
  return `<li class="g-matches__item"><a class="g-matches__row" href="${escapeHtml(row.href)}">${resultBody(row)}</a></li>`;
}

/**
 * «Results», with «4 · 1 · 1» (the season's league record) at the right of its head; «No matches played yet» when none.
 * @param {ReturnType<typeof import("./model.mjs").matchesModel>["results"]} rows
 * @param {{wins: number, draws: number, losses: number}|null} record null outside the table
 */
export function resultsMarkup(rows, record) {
  const tally = record
    ? `<span class="g-matches__record"><span class="g-sr-only">${escapeHtml(t("teamOverview.tile.record"))}: </span>${record.wins} · ${record.draws} · ${record.losses}</span>`
    : "";
  const body = rows.length
    ? `<ul class="g-matches__list">${rows.map(resultRow).join("")}</ul>`
    : `<p class="g-matches__empty">${escapeHtml(t("matches.noResults"))}</p>`;
  return `<section class="g-matches__section" aria-labelledby="matches-results"><div class="g-matches__bar">`
    + `<h2 class="g-matches__title" id="matches-results">${escapeHtml(t("matches.results"))}</h2>${tally}</div>${body}</section>`;
}

/** One row of what comes later: the round's word at the left, the match and a note under it. */
function laterBody({ label, title, note }) {
  return `<span class="g-matches__round">${escapeHtml(label)}</span><span class="g-matches__text">`
    + `<span class="g-matches__next">${escapeHtml(title)}</span><span class="g-matches__line">${escapeHtml(note)}</span></span>`;
}

/**
 * «Later in the season»: the team's other open matches (each a link to its preparation, post-match or game), then the
 * next round. Nothing when there is neither.
 * @param {ReturnType<typeof import("./model.mjs").matchesModel>["others"]} rows
 * @param {number|null} nextRound
 */
export function othersMarkup(rows, nextRound) {
  const open = rows.map((row) => {
    assertLinkHref(row.href);
    return `<li class="g-matches__item"><a class="g-matches__later" href="${escapeHtml(row.href)}">${laterBody(row)}</a></li>`;
  });
  const next = nextRound
    ? [`<li class="g-matches__item"><div class="g-matches__later">${laterBody({ label: t("matches.before.round", { round: nextRound }),
      title: t("teamOverview.opponentLater", { round: nextRound - 1 }), note: t("matches.swiss") })}</div></li>`]
    : [];
  if (!open.length && !next.length) return "";
  return `<section class="g-matches__section" aria-labelledby="matches-upcoming"><h2 class="g-matches__title g-matches__title--list" id="matches-upcoming">`
    + `${escapeHtml(t("matches.upcoming"))}</h2><ul class="g-matches__list">${[...open, ...next].join("")}</ul></section>`;
}

/** A calendar row's square: a played match's letter in its result's colour, the match on's number in the tint, a later one ringed. */
function squareMarkup({ label, result, current }) {
  if (result) {
    return `<span class="g-matches__square g-matches__square--${escapeHtml(result)}"><span aria-hidden="true">${escapeHtml(label)}</span>`
      + `<span class="g-sr-only">${escapeHtml(resultLabels(result).name)}</span></span>`;
  }
  return `<span class="g-matches__square${current ? " g-matches__square--current" : " g-matches__square--later"}">${escapeHtml(label)}</span>`;
}

/** One row of the calendar: the square, the opponent (a link to his team) over its line (a link to the match, for another open one), the score or «—». */
function calendarRow(row) {
  const name = row.opponent?.href
    ? `<a class="g-matches__calopp" href="${escapeHtml(row.opponent.href)}">${escapeHtml(row.opponent.name)}</a>`
    : `<span class="g-matches__calopp${row.muted ? " g-matches__calopp--muted" : ""}">${escapeHtml(row.opponent?.name ?? "")}</span>`;
  if (row.opponent?.href) assertLinkHref(row.opponent.href);
  if (row.href) assertLinkHref(row.href);
  const line = row.href
    ? `<a class="g-matches__calline" href="${escapeHtml(row.href)}">${escapeHtml(row.line)}</a>`
    : `<span class="g-matches__calline">${escapeHtml(row.line)}</span>`;
  const empty = row.score === "—";
  return `<li class="g-matches__calrow">${squareMarkup(row.square)}<span class="g-matches__text">${name}${line}</span>`
    + `<span class="g-matches__calscore${empty ? " g-matches__calscore--none" : ""}">${escapeHtml(row.score)}</span></li>`;
}

/**
 * «Calendar» (DeskSeason.html): its head with «Friendlies», then the season's played matches, the match on and the next
 * round; «No matches played yet» when there is none.
 * @param {ReturnType<typeof import("./model.mjs").matchesModel>["calendar"]} rows
 * @param {string} teamId
 */
export function calendarMarkup(rows, teamId) {
  const body = rows.length ? `<ul class="g-matches__list">${rows.map(calendarRow).join("")}</ul>` : `<p class="g-matches__empty">${escapeHtml(t("matches.noResults"))}</p>`;
  return `<section class="g-matches__calendar" aria-labelledby="matches-calendar"><div class="g-matches__calhead">`
    + `<h2 class="g-matches__caltitle" id="matches-calendar">${escapeHtml(t("matches.calendar"))}</h2>`
    + `<a class="g-matches__calfriendlies" href="${escapeHtml(teamUrl(teamId, "challenges"))}">${escapeHtml(t("teamOverview.friendlies"))}</a></div>${body}`
    + `<a class="g-matches__calall" href="${escapeHtml(seasonTabUrl())}">${escapeHtml(t("league.calendarAll"))}</a></section>`;
}

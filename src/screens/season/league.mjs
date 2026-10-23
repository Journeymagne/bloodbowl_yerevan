/**
 * The league's page, `#/season` (stage 10, decisions 9–11): the table and the season's calendar, open to a guest.
 *
 * One form for each width, drawn again when the width crosses 900px. A phone's is League.html: the season's name
 * with the last round over at its right, the table's eight columns, the league's rules under it, then the season's
 * calendar. A desk's is DeskSeason.html without its board: the band «Table» (its `h1`, as the prototype's; the owner,
 * 2026-10-21) with the season's line (and, for an admin, the way to the administration's season, `#/administration/season`
 * since stage 12), the table's card at the left and the calendar at its right.
 *
 * The season's calendar has no prototype (owner question 2): the league's rounds under way or over, newest first,
 * each pairing a line «Home — Away» built as DeskSeason.html's calendar draws a match, the score once confirmed,
 * a bye said as one, a result decided without being played said as a technical win and why (stage 12, decision 5).
 * A name leads where its row in the table does (`rowHref`): nowhere for a guest, nor for a withdrawn entry.
 *
 * The table draws the playoff zone the admin set for the season (`playoffPlacesOf`, stage 12), on both widths.
 *
 * Every `#/season/<tab>` is this page (`renderSeasonRoute`): the 2.x season screen and its two tabs went with stage 12
 * — a coach enters a team from its own pages (screens/season/enter.mjs), the admin runs the season in the
 * administration, and their old addresses lead there (`OLD_ADDRESSES`).
 */
import { drawKeepingFocus, escapeHtml, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { adminSeasonUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { lastRoundOver, leagueRounds, playoffPlacesOf, seasonTable } from "../../data/season-table.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { assertLinkHref, classNames } from "../../ui/markup.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { seasonLineOf } from "../matches/model.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { loadSeason } from "./season-data.mjs";
import { leagueTableMarkup, rowHref, tableCardMarkup, tableNotesMarkup } from "./table.mjs";

/**
 * What the page says.
 *
 * @param {object} input
 * @param {object|null} input.seasonData `/api/season`'s answer; null while it is not read
 * @param {string} [input.seasonError] why it could not be read
 * @param {{id: string, isAdmin?: boolean}|null} input.viewer the signed-in coach; null for a guest
 * @param {boolean} input.phone the screen is a phone's (up to 900px)
 */
export function leagueModel({ seasonData, seasonError = "", viewer, phone }) {
  const after = lastRoundOver(seasonData);
  return {
    phone,
    title: seasonData?.season?.name || t("shell.league"),
    after: after === null ? "" : t("league.after", { round: after }),
    line: seasonLineOf(seasonData),
    read: Boolean(seasonData),
    rows: seasonTable(seasonData),
    playoffPlaces: playoffPlacesOf(seasonData),
    rounds: leagueRounds(seasonData),
    viewerId: viewer?.id ?? "",
    signedIn: Boolean(viewer),
    admin: Boolean(viewer?.isAdmin),
    failure: seasonError && !seasonData ? t("teamOverview.seasonFailed", { reason: seasonError }) : "",
  };
}

/** A side's name: a link where its row in the table leads, text otherwise. */
function sideMarkup(side, viewer) {
  const href = rowHref(side, viewer);
  if (!href) return `<span class="g-league__team">${escapeHtml(side.team.name)}</span>`;
  assertLinkHref(href);
  return `<a class="g-league__team" href="${escapeHtml(href)}">${escapeHtml(side.team.name)}</a>`;
}

/** A sentence of the dictionary with markup in the place of its one parameter: the words around it escaped, the markup as it is. */
function sentenceWith(key, name, html) {
  const slot = "\u0000";
  const [before, after = ""] = t(key, { [name]: slot }).split(slot);
  return `${escapeHtml(before)}${html}${escapeHtml(after)}`;
}

const WAITING_WORDS = { result: "league.pending", confirmation: "league.awaiting" };

/** What the line under a pairing says: what it still waits for, or why a confirmed result was not played; "" for neither. */
function pairState(pairing) {
  if (pairing.technical) return t(`league.technical.${pairing.technical.reason}`);
  const waiting = WAITING_WORDS[pairing.waiting];
  return waiting ? t(waiting) : "";
}

/** One pairing: «Home — Away» (or the bye's line), what it waits for or a technical win under it, the score at the right. */
function pairMarkup(pairing, viewer) {
  const mine = viewer.signedIn && [pairing.home, pairing.away].some((side) => side && side.user?.id === viewer.viewerId);
  const names = pairing.away
    ? `${sideMarkup(pairing.home, viewer)} — ${sideMarkup(pairing.away, viewer)}`
    : sentenceWith("league.bye", "team", sideMarkup(pairing.home, viewer));
  const line = pairState(pairing);
  const score = pairing.score
    ? `<span class="g-league__score">${escapeHtml(`${pairing.score[0]}–${pairing.score[1]}`)}</span>`
    : `<span class="g-league__score g-league__score--none">—</span>`;
  return `<li class="${classNames("g-league__pair", mine && "g-league__pair--mine")}"><div class="g-league__teams">`
    + `<span class="g-league__names">${names}</span>${line ? `<span class="g-league__state">${escapeHtml(line)}</span>` : ""}</div>${score}</li>`;
}

/**
 * The season's calendar (decision 10): the rounds under way or over, newest first, their pairings by table.
 *
 * @param {ReturnType<typeof leagueRounds>} rounds
 * @param {{viewerId: string, signedIn: boolean}} viewer
 */
export function roundsMarkup(rounds, viewer) {
  const body = rounds.length
    ? rounds.map((round) => `<h3 class="g-league__round">${escapeHtml(`${t("matches.before.round", { round: round.number })} · ${t(`league.roundState.${round.status}`)}`)}</h3>`
      + `<ul class="g-league__pairs">${round.pairings.map((pairing) => pairMarkup(pairing, viewer)).join("")}</ul>`).join("")
    : `<p class="g-league__none">${escapeHtml(t("league.noRounds"))}</p>`;
  return `<section class="g-league__calendar" aria-labelledby="league-calendar">`
    + `<h2 class="g-league__caltitle" id="league-calendar">${escapeHtml(t("league.calendar"))}</h2>${body}</section>`;
}

/** The table, its rules under it; while the table is on its way, the word that it is. */
function tableMarkup(model) {
  if (!model.read) return model.failure ? "" : `<p class="g-league__loading" role="status">${escapeHtml(t("season.loading"))}</p>`;
  const { rows, phone, viewerId, signedIn, playoffPlaces } = model;
  const table = leagueTableMarkup({ rows, phone, viewerId, signedIn, labelledBy: "league-title", playoffPlaces });
  return rows.length ? `${table}${tableNotesMarkup({ phone, signedIn, playoffPlaces, rows })}` : table;
}

const failureMarkup = (model) => (model.failure ? `<div class="g-league__failed" role="alert">${renderCallout({ tone: "danger", title: model.failure })}</div>` : "");

/** A desk's: the band «Table», then the table's card and the calendar side by side (DeskSeason.html without the board). */
function deskMarkup(model) {
  const admin = model.admin
    ? `<a class="g-league__admin" href="${escapeHtml(adminSeasonUrl())}">${escapeHtml(t("league.admin"))}</a>` : "";
  const head = renderPageHead({ title: t("shell.tab.table"), sub: model.line, metaHtml: admin });
  const viewer = { viewerId: model.viewerId, signedIn: model.signedIn };
  return `${head}<div class="g-league">${failureMarkup(model)}<div class="g-season__row">`
    + `${tableCardMarkup({ titleId: "league-title", bodyHtml: tableMarkup(model) })}`
    + `<aside class="g-season__aside">${roundsMarkup(model.rounds, viewer)}</aside></div></div>`;
}

/**
 * The page in the form of the width.
 * @param {ReturnType<typeof leagueModel>} model
 */
export function leagueMarkup(model) {
  if (!model.phone) return deskMarkup(model);
  const bar = `<div class="g-league__bar"><h2 class="g-league__title" id="league-title">${escapeHtml(model.title)}</h2>`
    + `${model.after ? `<span class="g-league__after">${escapeHtml(model.after)}</span>` : ""}</div>`;
  return `${renderPageHead({ title: t("shell.tab.table") })}<div class="g-league">${failureMarkup(model)}${bar}${tableMarkup(model)}`
    + `${roundsMarkup(model.rounds, { viewerId: model.viewerId, signedIn: model.signedIn })}</div>`;
}

/**
 * The league's page. Drawn at once from what the page has, the title taking the focus; the table is read afresh on the
 * way in (as the 2.x screen did) and the page drawn again when it comes, and when the width crosses 900px — those
 * draws patch the page, so the focus stays where it was. A failure an earlier read left is not drawn while the read
 * repeating it is in the air. Leaving stops listening.
 */
export async function renderLeague() {
  let here = true;
  const held = { season: Boolean(state.season.error) };
  const markup = () => leagueMarkup(leagueModel({
    seasonData: state.season.data ?? null, seasonError: held.season ? "" : state.season.error, viewer: state.auth.currentUser ?? null, phone: isPhone(),
  }));
  const draw = () => {
    if (here) patch(view, markup());
  };
  const off = onPhoneChange(() => drawKeepingFocus(view, draw, "h1"));
  onScreenLeave("season-league", () => {
    here = false;
    off();
  });
  const read = loadSeason(true);
  view.innerHTML = markup();
  view.querySelector("h1")?.focus();
  await read;
  held.season = false;
  draw();
}

/**
 * `#/season/<tab>`: the league's page, whatever the tab — the router hands the tab over, and it is not read (stage 12:
 * the 2.x screen's `registration` and `administration` are gone; their old addresses are led on before the route is
 * drawn, `resolveRedirect`).
 */
export function renderSeasonRoute() {
  return renderLeague();
}

/**
 * A player's career on a phone's profile (owner, 2026-10-20; PlayerCareer.html): the totals from the roster's line, and
 * the matches as GET …/players/:pid/history tells them — read once a visit; nothing is written. A desk's career is stage
 * 07e's (DeskRosterCareer.html).
 *
 * The block stands right after «Skills»: a heading whose button opens the list and closes it (`aria-expanded`; it names
 * the list only while the list is there, K14), «N SPP · by match» beside the word, and under it, open or not, the
 * totals GP TD CAS COMP KO INT MVP. TD to MVP and the SPP are the roster's line (`line.career`, `line.earned`: the
 * roster and the records not settled yet, as the roster's table counts them), so they stand at once; GP waits for the
 * history: the confirmed matches the site knows the player played (owner's answer 1), «–» until it is read.
 *
 * The list is every match of the team's the site knows the player in, newest first («All matches · N», the owner's
 * answer 1): the history does not know when the player came to the team, so the matches before the first one the site
 * knows the player in (on the match's roster, or with what a post-match or a tap left) are not listed (decision 43). A
 * row says the round or «Friendly» and the opponent, the result from the team's side, what the player did — the
 * counters that are not nought in the roster's order, an MVP alone as «MVP», then the match's injury — or that the
 * match was missed («missed the match», with no reason: the history has none), that it has no details (a match from
 * before the site's records), or no actions; and its SPP, signed, by the race's weights. A match on waits for its
 * post-match (K15: by the match's status, so a match on where the player has no tap yet is not a match «without
 * details»; a confirmed match whose taps the post-match has not taken waits too). Then the edits outside a match, when
 * they are not all nought; last, when «N SPP» is more than the rows add up to, «Before the site's records» with the
 * rest (controller's ruling on review I1): SPP from matches before the site's records, from a player who came with
 * SPP or from the history's other exceptions — so the rows never fall short of the heading. They may go past it (an
 * undone death, a counter the heading floors at nought), and nothing is added then. The read is the visit's: a list
 * opened while it is in the air says so, one that failed says why and the next opening reads again; an answer that
 * comes after the coach left draws nothing.
 *
 * Two rows the history tells in its own way (stage 07e). A journeyman kept starts his history again under his new id
 * (the rollout plan, from 03): the match he was hired in has him on its roster under the old one (`played: false`),
 * and the post-match applied what he did there to the new one (`applied`) — so a row like that with something done is
 * a match he played, said as one and counted in GP; with nothing done it is one missed, as a player bought in the
 * post-match (a journeyman kept with nothing done reads so too: the history cannot tell them apart). And a player
 * killed in a match with no tap of his is on no roster the post-match left, so the history has no counters for him
 * (`source: "none"`) but the injury from the post-match's side: the row says the injury, «—» for its SPP. A «—» is
 * quiet whatever the row. A fallen player's rows end at the last match the site knows him in, as they begin at the
 * first: the history has every match of the team's, and each one after the death has him on no roster.
 */
import { refusalText } from "../../../core/api.mjs";
import { apiRequest } from "../../../core/api-client.mjs";
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { sppCounterWeights } from "../../../domain/roster/progression.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames } from "../../../ui/markup.mjs";
import { EXTRA_COUNTERS, MAIN_COUNTERS } from "./model.mjs";
import { injuryWords } from "./panel.mjs";

/** The list's id, which the heading's button names while the list is open (K14). */
const LIST = "player-career-list";
/** The keys of the rows that are no match: the edits outside one, and the SPP from before the site's records. */
const OUTSIDE = "outside";
const BEFORE = "before";
/** The counters a row names, in the roster's order: the table's, its narrow row's, then the catches. */
const SAID = [...MAIN_COUNTERS, ...EXTRA_COUNTERS, "catches"];

/** A number as a row writes it: a minus sign below nought. */
function counted(count) {
  return count < 0 ? `−${-count}` : String(count);
}
/** A row's SPP: «+N» above nought, «0», «−N» below. */
const signed = (spp) => (spp > 0 ? `+${spp}` : counted(spp));
/** A counter of a row as a number: what is not one is nought. */
const countOf = (counters, counter) => (Number.isFinite(counters?.[counter]) ? counters[counter] : 0);

/**
 * The player's career as the server tells it (`GET /api/teams/:id/players/:pid/history`): the team's matches, oldest
 * first, and the edits outside a match. A body without the matches is no answer.
 *
 * @param {string} teamId @param {string} playerId his id in the roster
 * @returns {Promise<{history: {matches: object[], outside: Record<string, number>}} | {error: string}>}
 */
export async function readCareer(teamId, playerId) {
  try {
    const { history } = (await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}/history`)) ?? {};
    if (!Array.isArray(history?.matches)) return { error: t("request.noAnswer") };
    const outside = history.outside && typeof history.outside === "object" ? history.outside : {};
    return { history: { matches: history.matches, outside } };
  } catch (error) {
    return { error: refusalText(error) };
  }
}

/**
 * @typedef {{key: string, title: string, result: string, outcome: "won"|"drawn"|"lost"|"", events: string, spp: string, points: number, quiet: boolean, pending: boolean}} CareerRow
 *   `points` what the row adds to the SPP (0 where it says «—»); `quiet` for a match missed, one without details, one
 *   with no actions and the SPP from before the site's records (a «—» is quiet in any row); `pending` for a match that
 *   waits for its post-match
 */

/** The counters that are not nought, in the roster's words: «TD 1», «TD −1», an MVP alone as «MVP». */
function countWords(counters) {
  return SAID.filter((counter) => countOf(counters, counter) !== 0).map((counter) => {
    const count = countOf(counters, counter);
    const label = t(`teamRoster.counter.${counter}`);
    return counter === "mvps" && count === 1 ? label : `${label} ${counted(count)}`;
  });
}

/** What the counters are worth to the race. */
const sppOf = (counters, weights) => SAID.reduce((sum, counter) => sum + countOf(counters, counter) * (weights[counter] ?? 0), 0);

/** «Round N · Opponent», or «Friendly · Opponent». */
function titleOf({ kind, roundNumber, opponent }) {
  const name = String(opponent?.name ?? "");
  if (kind === "friendly") return t("teamPlayer.career.friendly", { opponent: name });
  return t("teamPlayer.career.round", { round: roundNumber ?? "–", opponent: name });
}

/** The result from the team's side, «W 2–1» «D 1–1» «L 0–2»; none for a match with no score (one on). */
function resultOf(score) {
  if (!Number.isFinite(score?.own) || !Number.isFinite(score?.opponent)) return { result: "", outcome: "" };
  const words = { own: score.own, opponent: score.opponent };
  if (score.own > score.opponent) return { result: t("teamPlayer.career.won", words), outcome: "won" };
  if (score.own < score.opponent) return { result: t("teamPlayer.career.lost", words), outcome: "lost" };
  return { result: t("teamPlayer.career.drawn", words), outcome: "drawn" };
}

/**
 * Whether the player played the match: on its roster, or a journeyman kept — on it under his old id (`played: false`),
 * with what the post-match applied to his new one (`applied`), something that is not nought (stage 07e, decision 7).
 */
const playedIn = (match) => match.played === true
  || (match.played === false && match.source === "applied" && SAID.some((counter) => countOf(match.counters, counter) !== 0));

/**
 * A match's row (decision 43, K15; stage 07e, decisions 7–8): missed, the injury of a match the site has no counters
 * of, without details, with no actions, or what the player did and its SPP. A match on waits for its post-match; one
 * with no tap of the player's yet has no actions, not «no details».
 * @returns {CareerRow}
 */
function matchRow(match, weights) {
  const live = match.status === "in_progress";
  const row = { key: String(match.pairingId ?? ""), title: titleOf(match), ...resultOf(match.score), pending: live || match.pending === true };
  if (match.played === false && !playedIn(match)) return { ...row, events: t("teamPlayer.career.out"), spp: "—", points: 0, quiet: true };
  if (!match.counters && match.injury?.code) return { ...row, events: injuryWords(match.injury), spp: "—", points: 0, quiet: false };
  if (!match.counters) return { ...row, events: live ? t("teamPlayer.career.idle") : t("teamPlayer.career.bare"), spp: "—", points: 0, quiet: true };
  const said = [...countWords(match.counters), ...(match.injury?.code ? [injuryWords(match.injury)] : [])];
  const points = sppOf(match.counters, weights);
  if (!said.length) return { ...row, events: t("teamPlayer.career.idle"), spp: signed(points), points, quiet: true };
  return { ...row, events: said.join(" · "), spp: signed(points), points, quiet: false };
}

/** A match the site knows the player in: on its roster, or with what a post-match or a tap left. */
const knownIn = (match) => match.played === true || match.source !== "none";

/**
 * The rows of the list (decision 43): the matches from the first one the site knows the player in, newest first — for
 * a fallen player, up to the last one too (stage 07e, pre-flight L6: the history has every match of the team's, and
 * those after the death have him on no roster) — then the edits outside a match unless they are all nought; with
 * `earned`, last the SPP the rows do not hold, when there are any (ruling on I1): the rows then never fall short of it.
 *
 * @param {{matches: object[], outside: Record<string, number>}} history as `readCareer` answers it
 * @param {object} race the team's race: what each counter is worth to it
 * @param {{earned?: number|null, fallen?: boolean}} [heading] the SPP the block's heading says (`line.earned`); whether
 *   the player is a fallen one
 * @returns {CareerRow[]}
 */
export function careerRows(history, race, { earned = null, fallen = false } = {}) {
  const weights = sppCounterWeights(race);
  const matches = (Array.isArray(history?.matches) ? history.matches : []).filter((match) => match && typeof match === "object");
  const [first, last] = [matches.findIndex(knownIn), fallen ? matches.findLastIndex(knownIn) : matches.length - 1];
  const rows = first < 0 ? [] : matches.slice(first, last + 1).reverse().map((match) => matchRow(match, weights));
  const edits = countWords(history?.outside);
  if (edits.length) {
    const points = sppOf(history.outside, weights);
    rows.push({ key: OUTSIDE, title: t("teamPlayer.career.outside"), result: "", outcome: "", events: edits.join(" · "), spp: signed(points), points, quiet: false, pending: false });
  }
  const rest = Number.isFinite(earned) ? earned - rows.reduce((sum, row) => sum + row.points, 0) : 0;
  if (rest > 0) rows.push({ key: BEFORE, title: t("teamPlayer.career.before"), result: "", outcome: "", events: "", spp: signed(rest), points: rest, quiet: true, pending: false });
  return rows;
}

/**
 * GP: the confirmed matches the site knows the player played (the owner's answer 1), a journeyman kept's match of his
 * hiring among them (decision 7); a match on is not one yet.
 */
export function gamesPlayed(history) {
  return (Array.isArray(history?.matches) ? history.matches : []).filter((match) => match?.status === "confirmed" && playedIn(match)).length;
}

/** The totals: GP («–» until the history is read), then TD to MVP from the roster's line; a nought is quiet. */
function totalsMarkup(line, career) {
  const cell = (label, value) => `<div class="g-career__total"><dt class="g-career__key">${escapeHtml(label)}</dt>`
    + `<dd class="${classNames("g-career__value", (value === null || value === 0) && "g-career__zero")}">${escapeHtml(value ?? "–")}</dd></div>`;
  const games = career?.history ? gamesPlayed(career.history) : null;
  return `<dl class="g-career__totals">${cell(t("teamPlayer.career.gp"), games)}`
    + `${MAIN_COUNTERS.map((counter) => cell(t(`teamRoster.counter.${counter}`), line.career?.[counter] ?? 0)).join("")}</dl>`;
}

/**
 * A row: its title and result over what the player did, its SPP at the right, over «waits for the post-match» when it
 * does. The SPP from before the site's records has no match to say anything of: its title alone.
 */
function rowMarkup(row) {
  const result = row.outcome
    ? `<span class="g-career__result g-career__result--${escapeHtml(row.outcome)}">${escapeHtml(row.result)}</span>` : "";
  const plate = row.pending ? `<span class="g-career__pending">${escapeHtml(t("teamPlayer.career.pending"))}</span>` : "";
  return `<li class="g-career__row"><span class="g-career__main"><span class="g-career__line">`
    + `<b class="g-career__name">${escapeHtml(row.title)}</b>${result}</span>`
    + `${row.events ? `<span class="${classNames("g-career__events", row.quiet && "g-career__quiet")}">${escapeHtml(row.events)}</span>` : ""}</span>`
    + `<span class="g-career__side"><b class="${classNames("g-career__spp", (row.quiet || row.spp === "—") && "g-career__quiet")}">${escapeHtml(row.spp)}</b>${plate}</span></li>`;
}

/**
 * The list, open: «Reading the matches…» while the read is in the air or to be sent (K14: a career the toggle let go
 * is read on this draw), why a read failed, «No matches yet» or the head and the rows — either with the footnote
 * (ruling on I1: it says why the matches before the site's records are not there). The rows never fall short of `earned`.
 */
function listMarkup(race, career, earned) {
  const state = (words, { role = "", bad = false } = {}) => `<p class="${classNames("g-career__state", bad && "g-career__state--bad")}"`
    + `${role ? ` role="${role}"` : ""}>${escapeHtml(words)}</p>`;
  let body;
  if (!career || career.loading) body = state(t("teamPlayer.career.reading"), { role: "status" });
  else if (!career.history) body = state(t("teamPlayer.career.failed", { reason: career.error ?? "" }), { role: "alert", bad: true });
  else {
    const rows = careerRows(career.history, race, { earned });
    const count = rows.filter((row) => row.key !== OUTSIDE && row.key !== BEFORE).length;
    body = (!rows.length ? state(t("teamPlayer.career.none"))
      : `<div class="g-career__listhead"><span>${escapeHtml(t("teamPlayer.career.listHead", { count }))}</span><span>${escapeHtml(t("teamPlayer.career.sppHead"))}</span></div>`
        + `<ul class="g-career__rows">${rows.map(rowMarkup).join("")}</ul>`) + `<p class="g-career__note">${escapeHtml(t("teamPlayer.career.note"))}</p>`;
  }
  return `<div id="${LIST}" class="g-career__list">${body}</div>`;
}

/**
 * «Career» on a phone's profile (PlayerCareer.html): the heading's button with «N SPP · by match» and the chevron, the
 * totals, and the list while it is open.
 *
 * @param {{line: import("./model.mjs").PlayerLine, race: object, career: import("./index.mjs").Visit["career"], open: boolean}} props
 * @returns {string}
 */
export function careerMarkup({ line, race, career, open }) {
  const toggle = `<h2 class="g-career__head"><button type="button" class="g-career__toggle" aria-expanded="${open ? "true" : "false"}"`
    + `${open ? ` aria-controls="${LIST}"` : ""} data-player-career><span class="g-career__titles">`
    + `<span class="g-career__title">${escapeHtml(t("teamPlayer.career.title"))}</span>`
    + `<span class="g-career__sub">${escapeHtml(t("teamPlayer.career.sub", { spp: line.earned }))}</span></span>${icon("chevron", 18)}</button></h2>`;
  return `<section class="g-career">${toggle}${totalsMarkup(line, career)}${open ? listMarkup(race, career, line.earned) : ""}</section>`;
}

/**
 * The visit's read of the career: only for a phone's profile of a player of the roster (`screen.lines` hold him; a
 * fallen player's career is stage 07e's) and once a visit — again only after the toggle has let a failed one go. The
 * answer is taken only while the visit is here and asks for this read still.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {import("./view.mjs").RosterScreen} screen as just drawn
 */
export function askCareer({ teamId, visit, draw }, screen) {
  if (!screen.player || !screen.phone || screen.loading || screen.error || visit.career !== null) return;
  const line = screen.lines.find((each) => each.id === screen.player);
  if (!line) return;
  const asked = { loading: true };
  visit.career = asked;
  void readCareer(teamId, line.id).then((answer) => {
    if (!visit.here || visit.career !== asked) return;
    visit.career = answer;
    draw();
  });
}

/**
 * The heading's button: the list opens or closes; opened over a read that failed, the career is let go, so the draw
 * reads it again (Review Focus 4). The screen is patched: the focus stays on the button.
 * @param {import("./index.mjs").Saving} saving
 */
export function careerHandlers({ visit, draw }) {
  return {
    onCareerToggle: () => {
      visit.careerOpen = !visit.careerOpen;
      if (visit.careerOpen && visit.career && !visit.career.loading && !visit.career.history) visit.career = null;
      draw();
    },
  };
}

/**
 * A player's career on a phone's profile (owner, 2026-10-20; PlayerCareer.html): the totals from the roster's line, and
 * the matches as GET …/players/:pid/history tells them — read for the player, and again when the server has moved on;
 * nothing is written. A desk's roster panel draws it too, in a form of its own (stage 07e, DeskRosterCareer.html): the
 * last block, under the pair of actions, «by match» beside the word and no totals (the table carries TD to MVP); its
 * list is the rows alone, each with «waits for the post-match» before its SPP. It is read only while its list is open,
 * for the player in the panel (decision 3): the coach goes through the players with clicks.
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
 * SPP or from the history's other exceptions — so the rows never fall short of the heading as it stood when they were
 * read (`basis`, below). They may go past it (an undone death, a counter the heading floors at nought), and nothing is
 * added then. The reads are the visit's, one for each player (`visit.careers`, by his stored id): a list opened while
 * the first is in the air says so, one that failed says why and the next opening reads again; an answer that comes
 * after the coach left, or for a read the visit no longer asks for, draws nothing.
 *
 * A read is stamped with what the server knew when it was asked (stage 07e, decision 5): the revision the queue saves on
 * (`savedRevision`), the number of the roster's last read answered, how many rows the answers to taps have brought and
 * the match on. A save of the queue that lands, the roster read again (a match ended, another device's save, a write of
 * the treasury strip), a tap heard and a match begun or ended each move it, and a read whose stamp is behind is asked
 * again. Not while a read of the roster, a tap or the games are in the air: what they bring is not known yet, and the
 * stamp moves once they have answered — so a profile opened in a match reads once, after the games have said so
 * (pre-flight L1). Meanwhile the rows read before stand, and GP with them: «Reading the matches…» is only for a list
 * with no rows yet. What the rows do not hold («Before the site's records») is counted from the SPP of the moment the
 * read was asked (`basis`), not from the heading's, which is the line's now: the rows and that rest are one moment of
 * the server's, and a tap on its way makes no rest that is not there.
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
import { state } from "../../../core/state.mjs";
import { sppCounterWeights } from "../../../domain/roster/progression.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { EXTRA_COUNTERS, MAIN_COUNTERS } from "./model.mjs";
import { injuryWords } from "./panel.mjs";
import { savedRevision } from "./save.mjs";

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
 * The visit's read of a player's career (decision 5): the stamp it was asked on, whether it is in the air, and what the
 * last answer brought — the history, `basis` the SPP of the moment it was asked (`line.earned`, decision 6), or why it
 * failed.
 * @typedef {{stamp: string, loading: boolean, history: {matches: object[], outside: Record<string, number>}|null, basis: number|null, error: string}} CareerRead
 */

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
 * A row: its title and result over what the player did, its SPP at the right with «waits for the post-match» when it
 * does — under the SPP on a phone (PlayerCareer.html), before it on a desk (DeskRosterCareer.html) — and then the row
 * has the warning's soft fill on both (`g-career__row--pending`). The SPP from before the site's records has no match
 * to say anything of: its title alone.
 */
function rowMarkup(row, desk) {
  const result = row.outcome
    ? `<span class="g-career__result g-career__result--${escapeHtml(row.outcome)}">${escapeHtml(row.result)}</span>` : "";
  const plate = row.pending ? `<span class="g-career__pending">${escapeHtml(t("teamPlayer.career.pending"))}</span>` : "";
  const spp = `<b class="${classNames("g-career__spp", (row.quiet || row.spp === "—") && "g-career__quiet")}">${escapeHtml(row.spp)}</b>`;
  return `<li class="${classNames("g-career__row", row.pending && "g-career__row--pending")}"><span class="g-career__main"><span class="g-career__line">`
    + `<b class="g-career__name">${escapeHtml(row.title)}</b>${result}</span>`
    + `${row.events ? `<span class="${classNames("g-career__events", row.quiet && "g-career__quiet")}">${escapeHtml(row.events)}</span>` : ""}</span>`
    + `<span class="g-career__side">${desk ? `${plate}${spp}` : `${spp}${plate}`}</span></li>`;
}

/**
 * The list, open: «Reading the matches…» while there are no rows to draw and the read is in the air or to be sent (K14:
 * a career the toggle let go is read on this draw), why the last read failed, «No matches yet» or the head and the rows
 * of the last answer — a read asked again leaves them as they stand — either with the footnote (ruling on I1: it says
 * why the matches before the site's records are not there). The rows never fall short of the SPP of the read's moment.
 * A desk's is its rows alone (DeskRosterCareer.html): no head, no footnote. A fallen player's end at the last match the
 * site knows him in (pre-flight L6).
 * @param {object} race @param {CareerRead|null} career @param {{desk: boolean, fallen: boolean}} form
 */
function listMarkup(race, career, { desk, fallen }) {
  const state = (words, { role = "", bad = false } = {}) => `<p class="${classNames("g-career__state", bad && "g-career__state--bad")}"`
    + `${role ? ` role="${role}"` : ""}>${escapeHtml(words)}</p>`;
  let body;
  if (!career || (career.loading && !career.history)) body = state(t("teamPlayer.career.reading"), { role: "status" });
  else if (!career.history) body = state(t("teamPlayer.career.failed", { reason: career.error ?? "" }), { role: "alert", bad: true });
  else {
    const rows = careerRows(career.history, race, { earned: career.basis, fallen });
    const count = rows.filter((row) => row.key !== OUTSIDE && row.key !== BEFORE).length;
    const head = desk ? ""
      : `<div class="g-career__listhead"><span>${escapeHtml(t("teamPlayer.career.listHead", { count }))}</span><span>${escapeHtml(t("teamPlayer.career.sppHead"))}</span></div>`;
    body = !rows.length ? state(t("teamPlayer.career.none")) : `${head}<ul class="g-career__rows">${rows.map((row) => rowMarkup(row, desk)).join("")}</ul>`;
    if (!desk) body += `<p class="g-career__note">${escapeHtml(t("teamPlayer.career.note"))}</p>`;
  }
  return `<div id="${LIST}" class="g-career__list">${body}</div>`;
}

/**
 * «Career»: the heading's button — which names the player it is his for — and the chevron, then the list while it is
 * open. On a phone's profile (PlayerCareer.html) the button says «N SPP · by match» (the line's SPP now) and the
 * totals stand under it; in a desk's panel (`desk`, DeskRosterCareer.html) it says «by match», and there are no totals:
 * the table beside it carries TD to MVP. `heading` is the button's heading: «Skills»'s level where the block stands.
 *
 * @param {{line: import("./model.mjs").PlayerLine, race: object, career: CareerRead|null, open: boolean, desk?: boolean,
 *   heading?: "h2"|"h3"}} props `career` the visit's read of his
 * @returns {string}
 */
export function careerMarkup({ line, race, career, open, desk = false, heading = "h2" }) {
  const tag = heading === "h3" ? "h3" : "h2";
  const sub = desk ? t("teamPlayer.career.byMatch") : t("teamPlayer.career.sub", { spp: line.earned });
  const toggle = `<${tag} class="g-career__head"><button type="button" class="g-career__toggle" aria-expanded="${open ? "true" : "false"}"`
    + `${open ? ` aria-controls="${LIST}"` : ""}${dataAttributes({ playerCareer: line.id ?? "" })}><span class="g-career__titles">`
    + `<span class="g-career__title">${escapeHtml(t("teamPlayer.career.title"))}</span>`
    + `<span class="g-career__sub">${escapeHtml(sub)}</span></span>${icon("chevron", 18)}</button></${tag}>`;
  const totals = desk ? "" : totalsMarkup(line, career);
  return `<section class="${classNames("g-career", desk && "g-career--desk")}">${toggle}${totals}${open ? listMarkup(race, career, { desk, fallen: Boolean(line.fallen) }) : ""}</section>`;
}

/**
 * What the server knew when a read is asked (decision 5): the revision the queue saves on, the roster's last read
 * answered, the rows the answers to taps have brought, the match on. A visit that has none of them stamps "".
 */
const stampOf = (teamId, visit) => [savedRevision(teamId) ?? "", visit.answered ?? "", visit.heard?.length ?? 0, visit.match ?? ""].join("|");

/**
 * The visit's read of a player's career, asked when the visit has none for him or its stamp is behind the server's —
 * not for a line with no id, a visit that has left, while a read of the roster, a tap or the games are in the air, or
 * while his own read is on its way; again after the toggle has let a failed one go. The read asked keeps the rows
 * of the one before it until it answers; its answer is taken only while the visit is here and asks for this read still.
 *
 * @param {{teamId: string, visit: {here: boolean, careers: Map<string, CareerRead>, reads?: number, answered?: number,
 *   pending?: object[], heard?: object[], match?: string|null}, draw: () => void}} reading the visit's side
 * @param {import("./model.mjs").PlayerLine|null} line the line whose career is shown, null for none
 */
export function askCareer({ teamId, visit, draw }, line) {
  if (!line?.id || !visit.here || visit.answered !== visit.reads || visit.pending?.length || !state.games.loaded || state.games.loading) return;
  const before = visit.careers.get(line.id);
  const stamp = stampOf(teamId, visit);
  if (before?.loading || before?.stamp === stamp) return;
  /** @type {CareerRead} */
  const asked = { history: null, basis: null, error: "", ...before, stamp, loading: true };
  const basis = line.earned;
  visit.careers.set(line.id, asked);
  void readCareer(teamId, line.id).then((answer) => {
    if (!visit.here || visit.careers.get(line.id) !== asked) return;
    visit.careers.set(line.id, answer.history
      ? { stamp, loading: false, history: answer.history, basis, error: "" }
      : { stamp, loading: false, history: null, basis: null, error: answer.error });
    draw();
  });
}

/**
 * The heading's button, by the player's stored id: the list opens or closes; opened over his read that failed, the
 * read is let go, so the draw reads it again (Review Focus 4). The screen is patched: the focus stays on the button.
 * @param {{visit: {careers: Map<string, CareerRead>, careerOpen: boolean}, draw: () => void}} saving
 */
export function careerHandlers({ visit, draw }) {
  return {
    onCareerToggle: (playerId) => {
      visit.careerOpen = !visit.careerOpen;
      const read = visit.careers.get(playerId);
      if (visit.careerOpen && read && !read.loading && !read.history) visit.careers.delete(playerId);
      draw();
    },
  };
}

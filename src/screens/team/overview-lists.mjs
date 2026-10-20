/**
 * The overview's lists (DeskOverview, Team.html), each in the form of its width: the leaders and the recent results. The
 * league table beside them is stage 10's (the owner's answer).
 *
 * The leaders (stage 07d, decision 50) are a desk's cards (DeskOverview.html): the tag over the player's number on his
 * position's colour, his name over his position, and the figure at the right; and a phone's rows under «Leaders»
 * (Team.html): the tag, the name with «#3 Catcher» beside it, and the figure, SPP's in the accent. A card or a row is
 * the link to the player's address (`teamPlayerUrl`; on a desk the roster with the player in its panel) — on a phone the
 * whole row, so that a thumb has 44px to press where the prototype's link is the name's 32px. One the roster stores no
 * id for is said all the same, but no address knows him, and he is no link.
 *
 * The recent results (decision 52) are a desk's card «Results» with its head inside (DeskOverview.html): a row is the
 * pill, the round («Friendly» for a friendly), the opponent with the race and the team's MVP of the match under it, the
 * casualties and the score. A phone keeps Team.html's rows under «Recent matches»: the small pill, the opponent over the
 * round and the casualties, the score. On both the whole row is the link to the match (spec §3), so neither the
 * opponent nor the race is a link of its own, as they are in the prototype: a link cannot stand inside a link.
 *
 * What a leader is and who leads, and what a result says, are data/team-record.mjs's (`teamLeaders`, `recentResults`);
 * overview.mjs names the opponent's race and places what is drawn here in its columns.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, teamPlayerUrl, teamUrl } from "../../core/routes.mjs";
import { renderPlayerBadge } from "../../ui/number-badge.mjs";
import { renderResultPill } from "../../ui/result-pill.mjs";

/** "#3 Catcher": a player's number, when he has one, and his position. */
const playerLine = (number, position) => [number ? `#${number}` : "", position].filter(Boolean).join(" ");

/** A leader's tag (SPP, TD, CAS, COMP): the dictionary's word, as text. */
const leaderTag = (key) => `<span class="g-overview__leadertag">${escapeHtml(t(`teamOverview.leader.${key}`))}</span>`;

/** A card or a row: a link to the player's address, or the same box without one when the roster stores no id for him. */
function leaderBox(className, { id, teamId }, inner) {
  return id
    ? `<a class="${className}" href="${escapeHtml(teamPlayerUrl(teamId, id))}">${inner}</a>`
    : `<div class="${className}">${inner}</div>`;
}

/** A desk's card (DeskOverview.html): the tag; under it the number, the name over the position, and the figure. */
function leaderCard({ key, id, name, number, position, kind, value }, teamId) {
  return leaderBox("g-overview__leader", { id, teamId }, `${leaderTag(key)}<span class="g-overview__leaderrow">${renderPlayerBadge({ number, kind })}`
    + `<span class="g-overview__leaderwho"><span class="g-overview__leadername">${escapeHtml(name)}</span><span class="g-overview__leaderpos">${escapeHtml(position)}</span></span>`
    + `<span class="g-overview__leadervalue">${escapeHtml(value)}</span></span>`);
}

/** A phone's row (Team.html): the tag, the name with the number and the position beside it, and the figure — SPP's in the accent. */
function leaderLine({ key, id, name, number, position, value }, teamId) {
  const line = playerLine(number, position);
  const figure = key === "spp" ? "g-overview__leadervalue g-overview__leadervalue--spp" : "g-overview__leadervalue";
  return leaderBox("g-overview__leaderline", { id, teamId }, leaderTag(key)
    + `<span class="g-overview__leadername">${escapeHtml(name)}${line ? ` <span class="g-overview__leaderpos">${escapeHtml(line)}</span>` : ""}</span>`
    + `<span class="${figure}">${escapeHtml(value)}</span>`);
}

/**
 * The team's leaders in the form of the width: a desk's cards under «Team leaders», a phone's rows under «Leaders».
 * "" when nobody leads in anything.
 * @param {{leaders: ReturnType<typeof import("../../data/team-record.mjs").teamLeaders>, teamId: string, phone: boolean}} input
 */
export function leadersMarkup({ leaders, teamId, phone }) {
  if (!leaders.length) return "";
  const title = `<h2 class="g-overview__title" id="overview-leaders-title">${escapeHtml(t(phone ? "teamOverview.leadersShort" : "teamOverview.leaders"))}</h2>`;
  const body = phone
    ? `<div class="g-overview__leaderrows">${leaders.map((leader) => leaderLine(leader, teamId)).join("")}</div>`
    : `<div class="g-overview__leadercards">${leaders.map((leader) => leaderCard(leader, teamId)).join("")}</div>`;
  return `<section class="g-overview__leaders" aria-labelledby="overview-leaders-title">${title}${body}</section>`;
}

/** A desk's column of the round: «Round 6», or «Friendly» for a match that has none. */
const roundWord = ({ friendly, round }) => (friendly ? t("teamOverview.friendly") : t("teamOverview.round", { round }));

/**
 * What a desk's row says under the opponent (DeskOverview.html): the race, and after a dot the team's MVP of the match —
 * two for a winner who picks two. The MVP alone, without the dot, when the reference does not know the race; nothing
 * when neither is known. The dot is an element of its own, for the eye alone: a wrapped MVP does not start with it.
 */
function aboutMarkup({ race, mvps }) {
  const mvp = mvps.length ? t("teamOverview.mvp", { names: mvps.join(", ") }) : "";
  if (!race && !mvp) return "";
  const dot = race && mvp ? '<span class="g-overview__dot" aria-hidden="true">·</span>' : "";
  return `<span class="g-overview__sub">${race ? `<span class="g-overview__race">${escapeHtml(race)}</span>` : ""}${dot}`
    + `${mvp ? `<span class="g-overview__mvp">${escapeHtml(mvp)}</span>` : ""}</span>`;
}

/** A desk's row before the score (DeskOverview.html): the pill, the round, the opponent over what is known of the match, the casualties. */
function deskRow({ result, opponent, round, friendly, cas, race, mvps }) {
  return `${renderResultPill({ result })}<span class="g-overview__round">${escapeHtml(roundWord({ friendly, round }))}</span>`
    + `<span class="g-overview__text"><span class="g-overview__opponent">${escapeHtml(opponent)}</span>${aboutMarkup({ race, mvps })}</span>`
    + `<span class="g-overview__cas">${escapeHtml(t("teamOverview.cas", { cas }))}</span>`;
}

/** A phone's row before the score (Team.html): the small pill, the opponent over the round and the casualties. */
function phoneRow({ result, opponent, round, friendly, cas }) {
  const line = friendly ? t("teamOverview.friendlyLine", { cas }) : t("teamOverview.resultLine", { round, cas });
  return `${renderResultPill({ result, compact: true })}<span class="g-overview__text"><span class="g-overview__opponent">${escapeHtml(opponent)}</span>`
    + `<span class="g-overview__line">${escapeHtml(line)}</span></span>`;
}

/** One finished match in the form of the width, the score from our side at its end; the whole row opens the match. */
function resultRow(result, phone) {
  return `<li class="g-overview__result"><a class="g-overview__row" href="${escapeHtml(gameUrl(result.gameId))}">${phone ? phoneRow(result) : deskRow(result)}`
    + `<span class="g-overview__score">${escapeHtml(result.score)}</span></a></li>`;
}

/**
 * The team's recent results in the form of the width, with the way to the whole season at the head: a desk's card
 * «Results», a phone's «Recent matches». "" when no match is finished.
 * @param {{results: (ReturnType<typeof import("../../data/team-record.mjs").recentResults>[number] & {race: string})[], teamId: string, phone: boolean}} input
 */
export function resultsMarkup({ results, teamId, phone }) {
  if (!results.length) return "";
  const title = `<h2 class="g-overview__title" id="overview-results-title">${escapeHtml(t(phone ? "teamOverview.results" : "teamOverview.resultsTitle"))}</h2>`;
  return `<section class="g-overview__results" aria-labelledby="overview-results-title"><div class="g-overview__bar">${title}`
    + `<a class="g-overview__all" href="${escapeHtml(teamUrl(teamId, "matches"))}">${escapeHtml(t("teamOverview.wholeSeason"))}</a></div>`
    + `<ul class="g-overview__list">${results.map((result) => resultRow(result, phone)).join("")}</ul></section>`;
}

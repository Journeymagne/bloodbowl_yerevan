/**
 * The overview's lists (DeskOverview, Team.html), each in the form of its width. The leaders are drawn here; the recent
 * results are still overview.mjs's, and the league table beside them is stage 10's (the owner's answer).
 *
 * The leaders (stage 07d, decision 50) are a desk's cards (DeskOverview.html): the tag over the player's number on his
 * position's colour, his name over his position, and the figure at the right; and a phone's rows under «Leaders»
 * (Team.html): the tag, the name with «#3 Catcher» beside it, and the figure, SPP's in the accent. A card or a row is
 * the link to the player's address (`teamPlayerUrl`; on a desk the roster with the player in its panel) — on a phone the
 * whole row, so that a thumb has 44px to press where the prototype's link is the name's 32px. One the roster stores no
 * id for is said all the same, but no address knows him, and he is no link.
 *
 * What a leader is and who leads is data/team-record.mjs's (`teamLeaders`); overview.mjs places what is drawn here in
 * its columns.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { teamPlayerUrl } from "../../core/routes.mjs";
import { renderPlayerBadge } from "../../ui/number-badge.mjs";

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

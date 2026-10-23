/**
 * The current-match card in the desktop SideNav: the one match the coach is
 * most likely to want next, and the way into it.
 *
 * `currentMatch` picks it from the coach's games, `renderNavMatch` draws it.
 * The picking is data/match-phase.mjs's (stage 13, decision 22: a page's model
 * that asked which match is on read the frame's module); it is passed on from
 * here, so the readers of this module did not change.
 * Three phases, in this order (plan stage 05, decision 12): a match in play,
 * the next match of the round, a result sent and waiting to be confirmed. What
 * the card offers is 0.9's: one «Match preparation» before the match; during
 * it the team's records and the post-match; once a score is sent, the score —
 * and, when it is the opponent who sent it, the way to confirm it. In a phase a
 * league match comes before a friendly, and then the freshest wins.
 *
 * What each phase offers is `matchActions`, one description for the card and
 * for the team overview's board (screens/team/overview.mjs): words, ways and
 * the kind of each action, which each of the two draws in its own markup.
 *
 * Which games there are, and whether one is in the round players may still
 * play, is data/games.mjs's. Where the card's links go is core/routes.mjs's;
 * which side a team plays, and the figures of a game, are data/team-record.mjs's.
 * The caller puts the markup in the SideNav as `matchHtml` (shell/side-nav.mjs).
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { gameUrl, postMatchUrl, preMatchUrl, teamUrl } from "../core/routes.mjs";
import { gameSides } from "../data/team-record.mjs";
import { assertLinkHref } from "../ui/markup.mjs";
import { resultLabels } from "../ui/result-pill.mjs";

export { currentMatch, isMatchLive } from "../data/match-phase.mjs";

/** «Round 7 · home», or the word for a friendly, which has no round: the card's line, and the overview's board's. */
export function subLine(game, own) {
  if (game.kind === "friendly") return t("games.friendlyMatch");
  return t("shell.match.round", { round: game.roundNumber, venue: own === "home" ? t("shell.match.home") : t("shell.match.away") });
}

/** A figure of the score proposed, [ours, theirs] from the team's side; null when either number is missing. */
function sentPair(game, sides, kind) {
  const [own, other] = [sides.own, sides.other].map((side) => game[`proposed${side[0].toUpperCase()}${side.slice(1)}${kind}`]);
  return [own, other].some((value) => value === null || value === undefined) ? null : [own, other];
}

/**
 * The score sent or proposed to the team, from its side: «2–1», or with `between` the board's «2:1» (stage 09a, the
 * one reader of a score sent, for the card and the board); "" when a number of it is missing.
 * @param {object} game @param {{own: "home"|"away", other: "home"|"away"}} sides @param {string} [between]
 */
export function sentScore(game, sides, between = "–") {
  return sentPair(game, sides, "Touchdowns")?.join(between) ?? "";
}

/** The casualties sent, from the team's side: «1–0»; "" when a number of them is missing. */
export function sentCasualties(game, sides) {
  return sentPair(game, sides, "Casualties")?.join("–") ?? "";
}

/** «Win 2–1 · CAS 1–0» by the score proposed, from the coach's side, as plain text; "" when a number of it is missing. */
function sentLineOf(game, sides) {
  const touchdowns = sentPair(game, sides, "Touchdowns");
  const cas = sentCasualties(game, sides);
  if (!touchdowns || !cas) return "";
  const [td, against] = touchdowns;
  const kind = td > against ? "w" : td < against ? "l" : "d";
  return t("shell.match.result", { outcome: resultLabels(kind).name, score: sentScore(game, sides), cas });
}

/** No actions: a fresh one each time, since a caller may add to its list. */
const noActions = () => ({ links: [], sentLine: "" });

/**
 * What a match offers its team, in words and ways but not in markup: the one
 * description the SideNav card and the overview's board both draw from
 * (decision 12 of stage 05). The text is plain; each renderer escapes it and
 * wraps it in its own markup.
 *
 * A `kind` says how loud the action is, not which button it is:
 *   - "primary": the one thing to do next;
 *   - "light": the other thing to do, quieter;
 *   - "text": a way elsewhere, a plain link.
 * The renderers map them one by one (renderNavMatch below, renderBoardActions
 * in ui/match-board.mjs); none of them is a ui/button.mjs kind.
 *
 * Before the match there is «Match preparation». During it, the team's records
 * and the post-match. Once a score is sent, the score as a line and, when it is
 * the opponent who sent it (the payload says so as `viewerIsProposer: false`),
 * the way to confirm it: the coach's own proposal only waits.
 *
 * @param {ReturnType<typeof currentMatch>} current
 * @param {string|null} teamId the active team, the side the actions are for
 * @returns {{links: {label: string, href: string, kind: "primary"|"light"|"text"}[], sentLine: string}}
 */
export function matchActions(current, teamId) {
  const sides = current && gameSides(current.game, teamId);
  if (!sides) return noActions();
  const { game, phase } = current;
  if (phase === "live") {
    return { links: [
      { label: t("shell.match.records"), href: teamUrl(teamId, "roster"), kind: "text" },
      { label: t("shell.match.postMatch"), href: postMatchUrl(game), kind: "light" },
    ], sentLine: "" };
  }
  if (phase === "idle") return { links: [{ label: t("shell.match.prepare"), href: preMatchUrl(game), kind: "primary" }], sentLine: "" };
  if (phase === "sent") {
    const toConfirm = game.viewerIsProposer === false ? [{ label: t("shell.match.confirm"), href: gameUrl(game), kind: "primary" }] : [];
    return { links: toConfirm, sentLine: sentLineOf(game, sides) };
  }
  return noActions();
}

/** How the card draws each kind of action: its class. */
const NAV_LINK_CLASS = new Map([
  ["primary", "g-navmatch__cta"],
  ["light", "g-navmatch__cta g-navmatch__cta--light"],
  ["text", "g-navmatch__link"],
]);

function renderNavLink({ label, href, kind }) {
  if (!NAV_LINK_CLASS.has(kind)) throw new Error(`unknown match action kind: ${kind}`);
  assertLinkHref(href);
  return `<a class="${NAV_LINK_CLASS.get(kind)}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/**
 * The card for `current`: a label (with a live dot while the match is on), the
 * opponent, the round and venue, and what the phase offers (`matchActions`).
 * Nothing for no match.
 *
 * @param {ReturnType<typeof currentMatch>} current
 * @param {string|null} teamId the active team, the side the card speaks for
 * @returns {string} markup for the SideNav's `matchHtml`
 */
export function renderNavMatch(current, teamId) {
  if (!current) return "";
  const { game, phase } = current;
  const sides = gameSides(game, teamId);
  if (!sides) return "";
  const live = phase === "live";
  const label = { live: t("shell.match.live"), idle: t("shell.match.next"), sent: t("shell.match.awaiting") }[phase];
  const dot = live ? '<span class="g-navmatch__dot" aria-hidden="true"></span>' : "";
  const { links, sentLine } = matchActions(current, teamId);
  const result = sentLine ? `<span class="g-navmatch__result">${escapeHtml(sentLine)}</span>` : "";
  return `<section class="g-navmatch${live ? " g-navmatch--live" : ""}" aria-label="${escapeHtml(t("shell.match.aria"))}">`
    + `<span class="g-navmatch__label">${dot}${escapeHtml(label)}</span>`
    + `<span class="g-navmatch__opp">${escapeHtml(game[sides.other].team?.name ?? "")}</span>`
    + `<span class="g-navmatch__sub">${escapeHtml(subLine(game, sides.own))}</span>${result}${links.map(renderNavLink).join("")}</section>`;
}

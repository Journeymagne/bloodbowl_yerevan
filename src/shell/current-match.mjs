/**
 * The current-match card in the desktop SideNav: the one match the coach is
 * most likely to want next, and the way into it.
 *
 * `currentMatch` picks it from the coach's games, `renderNavMatch` draws it.
 * Three phases, in this order (plan stage 05, decision 12): a match in play,
 * the next match of the round, a result sent and waiting to be confirmed. What
 * the card offers is 0.9's: one «Match preparation» before the match; during
 * it the team's records and the post-match; once a score is sent, the score —
 * and, when it is the opponent who sent it, the way to confirm it. In a phase a
 * league match comes before a friendly, and then the freshest wins.
 *
 * Which games there are, and whether one is in the round players may still
 * play, is data/games.mjs's. Where the card's links go is core/routes.mjs's.
 * The caller puts the markup in the SideNav as `matchHtml` (shell/side-nav.mjs).
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { gameUrl, postMatchUrl, preMatchUrl, teamUrl } from "../core/routes.mjs";
import { isCurrentPlayerRoundGame, isGameClosedForPlayers, isGameResultSubmitted } from "../data/games.mjs";
import { assertLinkHref } from "../ui/markup.mjs";
import { resultLabels } from "../ui/result-pill.mjs";

/** The phases, most urgent first. */
const PHASES = ["live", "idle", "sent"];

/**
 * Whether a match is on, as the server counts it (server/season/live-match.mjs,
 * `LIVE_MATCH`): started, its post-match not completed, and either a post-match
 * to finish or a score nobody has confirmed. A started match whose score was
 * confirmed around the post-match (2.x let both coaches or the admin do so) is
 * not on, and the server answers a tap on it 409 MATCH_NOT_LIVE — so the card
 * offers no «Match records» and no «Post-match» for it. Until its post-match is
 * opened, when it is on again. The payload says `not_started` for a match that
 * has no post-match row.
 *
 * The list on "My games" asks a looser question of its own (a started match is
 * "next" until its post-match is completed) and keeps it; this is the card's.
 *
 * @param {object} game one of the coach's games, as `/api/games` sends it
 * @returns {boolean}
 */
export function isMatchLive(game) {
  const postMatch = game?.postMatchStatus ?? "not_started";
  return game?.preparationStatus === "in_progress"
    && postMatch !== "completed"
    && (postMatch !== "not_started" || game.resultStatus !== "confirmed");
}

/** The side of `game` that is `teamId`'s, and the other one; null when the team is not in the game or has no opponent (a bye). */
function sidesOf(game, teamId) {
  if (game?.home?.team?.id === teamId && game.away) return { own: "home", other: "away" };
  if (game?.away?.team?.id === teamId && game.home) return { own: "away", other: "home" };
  return null;
}

/**
 * The phase a game of the team is in, or null when it is none the card shows.
 * A result still waiting in a round that is over is none: no coach can confirm
 * it any more, and the card would say «Awaiting confirmation» for the rest of
 * the season.
 */
function phaseOf(game) {
  if (isMatchLive(game)) return "live";
  if (isGameClosedForPlayers(game)) return null;
  if (game.resultStatus === "awaiting_confirmation") return "sent";
  return !isGameResultSubmitted(game) && isCurrentPlayerRoundGame(game) ? "idle" : null;
}

/** When a game last changed, as a number to sort by; a missing or unreadable stamp is the oldest. */
const changedAt = (game) => Date.parse(game.updatedAt) || 0;

/** What a game is sorted by, smallest first: its phase, a league match before a friendly, the freshest. */
const rankOf = (game, phase) => [PHASES.indexOf(phase), game.kind === "friendly" ? 1 : 0, -changedAt(game)];

/** Whether the first rank comes before the second. */
function comesBefore(first, second) {
  const at = first.findIndex((value, index) => value !== second[index]);
  return at !== -1 && first[at] < second[at];
}

/**
 * The match the card is about: the most urgent phase the team's games are in;
 * in it a league match before a friendly (one accepted later does not hide this
 * round's match), and then the game that changed last.
 *
 * @param {object[]} games the coach's games (`state.games.items`)
 * @param {string|null} teamId the active team
 * @returns {{game: object, phase: "live"|"idle"|"sent"}|null}
 */
export function currentMatch(games, teamId) {
  if (!teamId) return null;
  let best = null;
  for (const game of games) {
    const phase = sidesOf(game, teamId) ? phaseOf(game) : null;
    if (!phase) continue;
    const rank = rankOf(game, phase);
    if (!best || comesBefore(rank, best.rank)) best = { game, phase, rank };
  }
  return best && { game: best.game, phase: best.phase };
}

/** «Round 7 · home», or the word for a friendly, which has no round. */
function subLine(game, own) {
  if (game.kind === "friendly") return t("games.friendlyMatch");
  return t("shell.match.round", { round: game.roundNumber, venue: own === "home" ? t("shell.match.home") : t("shell.match.away") });
}

/** «Win 2–1 · CAS 1–0» by the score proposed, from the coach's side; "" when a number of it is missing. */
function sentLine(game, sides) {
  const [own, other] = [sides.own, sides.other].map((side) => side[0].toUpperCase() + side.slice(1));
  const pick = (kind, side) => game[`proposed${side}${kind}`];
  const [td, against, cas, casAgainst] = [pick("Touchdowns", own), pick("Touchdowns", other), pick("Casualties", own), pick("Casualties", other)];
  if ([td, against, cas, casAgainst].some((value) => value === null || value === undefined)) return "";
  const kind = td > against ? "w" : td < against ? "l" : "d";
  return `<span class="g-navmatch__result">${escapeHtml(t("shell.match.result", { outcome: resultLabels(kind).name, score: `${td}–${against}`, cas: `${cas}–${casAgainst}` }))}</span>`;
}

function renderAction({ label, href, light = false }) {
  assertLinkHref(href);
  return `<a class="g-navmatch__cta${light ? " g-navmatch__cta--light" : ""}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderRecordsLink(teamId) {
  const href = teamUrl(teamId, "roster");
  assertLinkHref(href);
  return `<a class="g-navmatch__link" href="${escapeHtml(href)}">${escapeHtml(t("shell.match.records"))}</a>`;
}

/**
 * The card for `current`: a label (with a live dot while the match is on), the
 * opponent, the round and venue, and what the phase offers. Nothing for no match.
 *
 * @param {ReturnType<typeof currentMatch>} current
 * @param {string|null} teamId the active team, the side the card speaks for
 * @returns {string} markup for the SideNav's `matchHtml`
 */
export function renderNavMatch(current, teamId) {
  if (!current) return "";
  const { game, phase } = current;
  const sides = sidesOf(game, teamId);
  if (!sides) return "";
  const live = phase === "live";
  const label = { live: t("shell.match.live"), idle: t("shell.match.next"), sent: t("shell.match.awaiting") }[phase];
  const dot = live ? '<span class="g-navmatch__dot" aria-hidden="true"></span>' : "";
  // A score the opponent sent is the coach's to confirm (the payload says so as `viewerIsProposer: false`); the coach's own waits for the opponent.
  const toConfirm = game.viewerIsProposer === false ? renderAction({ label: t("shell.match.confirm"), href: gameUrl(game) }) : "";
  const actions = {
    live: `${renderRecordsLink(teamId)}${renderAction({ label: t("shell.match.postMatch"), href: postMatchUrl(game), light: true })}`,
    idle: renderAction({ label: t("shell.match.prepare"), href: preMatchUrl(game) }),
    sent: `${sentLine(game, sides)}${toConfirm}`,
  }[phase];
  return `<section class="g-navmatch${live ? " g-navmatch--live" : ""}" aria-label="${escapeHtml(t("shell.match.aria"))}">`
    + `<span class="g-navmatch__label">${dot}${escapeHtml(label)}</span>`
    + `<span class="g-navmatch__opp">${escapeHtml(game[sides.other].team?.name ?? "")}</span>`
    + `<span class="g-navmatch__sub">${escapeHtml(subLine(game, sides.own))}</span>${actions}</section>`;
}

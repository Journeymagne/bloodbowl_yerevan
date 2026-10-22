/**
 * What `#/games/:id` is (stage 13, decision 10; the owner's answer 1), with no DOM.
 *
 * A side's coach is sent where the match is now (`gameDestination`): the summary of a finished post-match, the
 * post-match of a match in play or opened, the preparation of a match not begun in a round still open. Everyone else
 * — an administrator, a coach of neither side — and a side's coach whose match has none of these (a score sent before
 * 3.0 waiting, a result the admin or 2.x wrote with no post-match on the site, a round closed) reads the match page:
 * its card (`gamePageModel`) and, for the side a score sent before 3.0 waits on, «Confirm the score» and «Reject».
 *
 * Who a side is goes by the coach (the payload's `user.id`), not by the account's role: an administrator who plays the
 * match is its coach. A coach of neither side never gets the payload (the server answers 404), so the page says that.
 */
import { t } from "../../core/i18n.mjs";
import { gameUrl, playerTeamUrl, postMatchUrl, preMatchUrl, seasonTabUrl, teamUrl } from "../../core/routes.mjs";
import { isGameClosedForPlayers, isGameResultSubmitted } from "../../data/games.mjs";
import { isMatchLive, sentCasualties, sentScore } from "../../shell/current-match.mjs";

/** The phases the page's chip says (`gamePage.status.${phase}`): a score waiting, a result in, a round over without one, the rest. */
export const GAME_PAGE_PHASES = Object.freeze(["sent", "played", "closed", "open"]);

/** The page's chip by phase: a score waiting is the warning colour, the rest is quiet. */
const PHASE_TONES = { sent: "wait", played: "neutral", closed: "neutral", open: "neutral" };

/** The score as the card reads it, the home side first. */
const HOME_FIRST = { own: "home", other: "away" };

/** Which side of `game` the coach `viewerId` plays: "home", "away", or "" for neither. */
function sideOf(game, viewerId) {
  if (!viewerId) return "";
  if (game?.home?.user?.id === viewerId) return "home";
  return game?.away?.user?.id === viewerId ? "away" : "";
}

/**
 * Where a side's coach goes from `#/games/:id`: the summary of a finished post-match, the post-match of a match in play
 * or opened, the preparation of a match not begun with nothing sent, in a round still open; "" for the page itself —
 * for anyone who is not a side, and for a side whose match is none of these.
 * @param {object} game as `GET /api/games/:id` sends it
 * @param {string} viewerId the signed-in coach
 * @returns {string}
 */
export function gameDestination(game, viewerId) {
  if (!sideOf(game, viewerId)) return "";
  const postMatch = game.postMatchStatus ?? "not_started";
  if (postMatch === "completed") return postMatchUrl(game, "review");
  if (isMatchLive(game) || postMatch !== "not_started") return postMatchUrl(game);
  const fresh = game.preparationStatus !== "in_progress" && !isGameResultSubmitted(game) && !isGameClosedForPlayers(game)
    && game.resultStatus !== "awaiting_confirmation";
  return fresh ? preMatchUrl(game) : "";
}

/** The page's phase: a result in, a score waiting, a round over for players without either, the rest. */
function phaseOf(game) {
  if (isGameResultSubmitted(game)) return "played";
  if (game.resultStatus === "awaiting_confirmation") return "sent";
  return isGameClosedForPlayers(game) ? "closed" : "open";
}

/** A figure pair of the result in, «3–0», the home side first; "" when a number is missing. */
function resultPair(game, kind) {
  const pair = [game[`home${kind}`], game[`away${kind}`]];
  return pair.some((value) => value === null || value === undefined) ? "" : pair.join("–");
}

/**
 * One side as the card draws it: the team leading to its page (the coach's own team's overview, another's public page)
 * over its coach's login; a side the pairing has no team for is a dash.
 */
function cardSide(side, viewerId) {
  if (!side?.team) return { name: "—" };
  const own = Boolean(viewerId) && side.user?.id === viewerId;
  const href = own ? teamUrl(side.team.id) : side.user?.id ? playerTeamUrl(side.user.id, side.team.id) : "";
  return { name: side.team.name || "—", sub: side.user?.login ?? "", href };
}

/** The ways on, for anyone who may read them: the preparation of a match begun, the post-match once it is opened. */
function linksOf(game) {
  const links = [];
  if (game.preparationStatus === "in_progress") links.push({ label: t("shell.match.prepare"), href: preMatchUrl(game) });
  const postMatch = game.postMatchStatus ?? "not_started";
  if (postMatch !== "not_started") links.push({ label: t("shell.match.postMatch"), href: postMatchUrl(game, postMatch === "completed" ? "review" : "") });
  return links;
}

/**
 * The match page: its title and line, the two sides, the score (a result in, or the one sent) and its casualties, the
 * phase and its chip's tone; for a side a score sent before 3.0 waits on, whether it confirms (`confirm`, the side that
 * did not send it), who confirms it (`waitingFor`, for the side that did) or that the round is closed (`roundClosed`:
 * the server refuses a player then, so nothing is offered); the ways on.
 * @param {{game: object, viewer: {id: string, isAdmin?: boolean}|null}} input
 */
export function gamePageModel({ game, viewer }) {
  const viewerId = viewer?.id ?? "";
  const own = sideOf(game, viewerId);
  const phase = phaseOf(game);
  const waiting = Boolean(own) && game.resultStatus === "awaiting_confirmation";
  const closed = waiting && isGameClosedForPlayers(game);
  const other = own === "home" ? "away" : "home";
  return {
    title: t("gamePage.title"),
    line: game.kind === "friendly" ? t("gamePage.friendly") : t("gamePage.round", { season: game.season?.name ?? "", round: game.roundNumber }),
    home: cardSide(game.home, viewerId),
    away: cardSide(game.away, viewerId),
    score: phase === "played" ? resultPair(game, "Touchdowns") : phase === "sent" ? sentScore(game, HOME_FIRST) : "",
    cas: phase === "played" ? resultPair(game, "Casualties") : phase === "sent" ? sentCasualties(game, HOME_FIRST) : "",
    phase,
    chipTone: PHASE_TONES[phase],
    confirm: waiting && !closed && game.viewerIsProposer === false,
    waitingFor: waiting && !closed && game.viewerIsProposer === true ? game[other]?.team?.name ?? "" : "",
    roundClosed: closed,
    links: linksOf(game),
  };
}

/** The team's matches, or the league's page for a coach with no team active. */
export const matchesUrl = (activeTeamId) => (activeTeamId ? teamUrl(activeTeamId, "matches") : seasonTabUrl());

/**
 * Where «‹» leads on the page a preparation or a post-match shows while it is read, or when it could not be (pre-flight
 * L11): a side's coach to the team's matches — the side's team when the coach's games name it, else the active one —,
 * never to `#/games/:id`, which would send him straight back; an administrator who plays neither side to the match page,
 * which sends nobody on.
 * @param {string} gameId
 * @param {{viewer: {id: string, isAdmin?: boolean}|null, activeTeamId: string|null, games: object[]}} where
 */
export function placeholderBack(gameId, { viewer, activeTeamId, games = [] }) {
  const known = games.find((game) => game.id === gameId);
  const own = known ? sideOf(known, viewer?.id) : "";
  if (own) return matchesUrl(known[own].team?.id ?? activeTeamId);
  return viewer?.isAdmin ? gameUrl(gameId) : matchesUrl(activeTeamId);
}

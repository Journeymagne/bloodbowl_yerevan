/**
 * Which match of a team's is the one to show, and whether a match is on: the rule the SideNav's current-match card, the
 * team's overview, the roster and the team page all read, so that they name the same game. Plain functions of the
 * coach's games, as `/api/games` sends them: no markup, no words, no state.
 *
 * Moved out of shell/current-match.mjs (stage 13, decision 22): a page's model that asked which match is on read the
 * module that draws the frame. The card draws from here; shell/current-match.mjs passes both on, so its readers did
 * not change. Which games there are, and whether one is in the round players may still play, is data/games.mjs's;
 * which side a team plays is data/team-record.mjs's.
 */
import { isCurrentPlayerRoundGame, isGameClosedForPlayers, isGameResultSubmitted } from "./games.mjs";
import { gameSides } from "./team-record.mjs";

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
 * @param {object} game one of the coach's games, as `/api/games` sends it
 * @returns {boolean}
 */
export function isMatchLive(game) {
  const postMatch = game?.postMatchStatus ?? "not_started";
  return game?.preparationStatus === "in_progress"
    && postMatch !== "completed"
    && (postMatch !== "not_started" || game.resultStatus !== "confirmed");
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
    const phase = gameSides(game, teamId) ? phaseOf(game) : null;
    if (!phase) continue;
    const rank = rankOf(game, phase);
    if (!best || comesBefore(rank, best.rank)) best = { game, phase, rank };
  }
  return best && { game: best.game, phase: best.phase };
}

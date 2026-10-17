/**
 * The signed-in coach's games: the list the app loads, and the rules that say
 * what a game is — whether its result is in, whether it belongs to the round
 * players may still play, whether that round is over for them.
 *
 * Moved out of screens/games/my-games.mjs so that the screens (my games, a
 * single game) and the frame (the SideNav's match card, shell/current-match.mjs)
 * ask the same questions of the same list. `loadGames` fills `state.games`;
 * app.js warms it on sign-in, and a screen that changed a game sets
 * `state.games.loaded = false` and asks again.
 */
import { errorText } from "../core/api.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { state } from "../core/state.mjs";

let gamesLoadPromise = null;
export async function loadGames(force = false) {
  if (!state.auth.currentUser) return;
  if (state.games.loaded && !force) return;
  if (gamesLoadPromise && !force) return gamesLoadPromise;
  state.games.loading = true;
  gamesLoadPromise = (async () => {
    try {
      const payload = await apiRequest("/api/games");
      state.games = { items: payload.games ?? [], currentItems: payload.currentGames ?? [], loaded: true, loading: false, error: "" };
    } catch (error) {
      state.games = { items: [], currentItems: [], loaded: true, loading: false, error: errorText(error) };
    } finally {
      gamesLoadPromise = null;
    }
  })();
  return gamesLoadPromise;
}
export function isGameResultSubmitted(game) {
  return game?.resultStatus === "confirmed"
    && game.homeTouchdowns !== null
    && game.homeTouchdowns !== undefined
    && game.awayTouchdowns !== null
    && game.awayTouchdowns !== undefined
    && game.homeCasualties !== null
    && game.homeCasualties !== undefined
    && game.awayCasualties !== null
    && game.awayCasualties !== undefined;
}
export function isCurrentPlayerRoundGame(game) {
  if (game.kind === "friendly") return true;
  return game?.roundStatus === "started"
    && Number(game?.roundNumber ?? 0) === Number(game?.season?.currentRound ?? 0);
}
export function isGameClosedForPlayers(game) {
  if (game?.kind === "friendly") return game.resultStatus === "confirmed";
  return game?.roundStatus === "completed"
    || (game?.roundStatus === "started" && Number(game?.roundNumber ?? 0) < Number(game?.season?.currentRound ?? 0));
}

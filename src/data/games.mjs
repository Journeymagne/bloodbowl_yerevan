/**
 * The signed-in coach's games: the list the app loads, and the rules that say
 * what a game is — whether its result is in, whether it belongs to the round
 * players may still play, whether that round is over for them.
 *
 * Moved out of screens/games/my-games.mjs so that the screens (my games, a
 * single game) and the frame (the SideNav's match card, shell/current-match.mjs)
 * ask the same questions of the same list. `loadGames` fills `state.games`;
 * app.js warms it on sign-in. A screen that has changed a game (a start, a
 * result, a challenge, a deleted team) calls `invalidateGames`, which reads
 * the list again; whoever draws from it listens with `onGamesChange` (the shell
 * does, so the match card follows what the screens do).
 */
import { errorText } from "../core/api.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { state } from "../core/state.mjs";

const listeners = new Set();

/** @param {() => void} listener @returns {() => void} what removes it again */
export function onGamesChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every listener hears it, each on its own: one that throws does not stop the rest. */
function gamesChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

let gamesLoadPromise = null;
/** The number of the request that owns the next write: a forced call sends its own, and only the last one sent is written. */
let loadTicket = 0;
/**
 * Read the list into `state.games` and tell the listeners — on an answer and on a failure alike. A failed
 * read keeps what was there and sets `error`, so a blip in the network does not empty the frame's card; the
 * screen that shows the error reads it from `state.games.error`. A forced call sends a request of its own; the
 * answer of one that has been overtaken by a newer is dropped, and its caller waits for the newer one. So is
 * the answer for a coach who is no longer the one signed in (signed out, or another signed in meanwhile):
 * those are not the games of whoever is here now.
 */
export async function loadGames(force = false) {
  const userId = state.auth.currentUser?.id;
  if (userId === undefined) return;
  if (state.games.loaded && !force) return;
  if (gamesLoadPromise && !force) return gamesLoadPromise;
  state.games.loading = true;
  const ticket = ++loadTicket;
  const load = (async () => {
    let next;
    try {
      const payload = await apiRequest("/api/games");
      next = { items: payload.games ?? [], currentItems: payload.currentGames ?? [], loaded: true, loading: false, error: "" };
    } catch (error) {
      next = { ...state.games, loaded: true, loading: false, error: errorText(error) };
    }
    if (ticket !== loadTicket) return gamesLoadPromise;
    gamesLoadPromise = null;
    if (state.auth.currentUser?.id !== userId) return;
    state.games = next;
    gamesChanged();
  })();
  gamesLoadPromise = load;
  return load;
}

/** A screen has changed a game: read the list again, so what is drawn from it (the SideNav's match card) is not the list from before. */
export function invalidateGames() {
  return loadGames(true);
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

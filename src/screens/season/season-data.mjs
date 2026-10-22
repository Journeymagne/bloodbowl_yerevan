/**
 * The season's data operations — loading it, and applying a server response
 * after a mutation.
 *
 * Mechanically moved out of src/app.js. The 2.x season screen that first read
 * it went with stage 12; the league's page, the team's pages and the shell call
 * `loadSeason`, and the writes that answer with the season — the
 * administration's (data/admin.mjs) and a coach's entry (data/season-entry.mjs)
 * — call `replaceSeasonData`.
 */
import { errorText } from "../../core/api.mjs";
import { state } from "../../core/state.mjs";
import { apiRequest } from "../../core/api-client.mjs";

/** The request on its way, and whom it was sent for: `{userId, done}`, or null. */
let inFlight = null;

/**
 * Fetch the season, signed in or not.
 *
 * This used to return an empty season for a signed-out visitor without asking
 * the server at all, which was correct while /api/season answered 401. Since
 * step 10.3 it answers the public half — the table, the schedule, the results —
 * and short-circuiting here would have made that change invisible.
 *
 * One request at a time: a call while one is on its way, forced or not, waits
 * for that one (the shell asks for the table as the season screen forces it,
 * and two answers racing would each reset `loading`). Unless the visitor has
 * changed since it was sent — a guest's answer is not a coach's — then a new
 * one goes out and the older answer is dropped.
 *
 * @returns {Promise<void>}
 */
export function loadSeason(force = false) {
  const userId = state.auth.currentUser?.id ?? null;
  if (inFlight && inFlight.userId === userId) return inFlight.done;
  if (state.season.loaded && !force) return Promise.resolve();
  state.season.loading = true;
  state.season.error = "";
  const load = { userId, done: null };
  const current = () => inFlight === load;
  inFlight = load;
  load.done = (async () => {
    try {
      const data = await apiRequest("/api/season");
      if (current()) Object.assign(state.season, { data, loaded: true });
    } catch (error) {
      if (current()) state.season.error = errorText(error);
    } finally {
      if (current()) {
        state.season.loading = false;
        inFlight = null;
      }
    }
  })();
  return load.done;
}

/** Apply a server response after a mutation, without a full reload. */
export function replaceSeasonData(payload) {
  state.season.data = payload;
  state.season.loaded = true;
}

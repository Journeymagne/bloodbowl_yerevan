/**
 * The season screen's data operations — loading it, applying a server
 * response after a mutation, and shaping a starter roster for the admin's
 * "create and commit a team for a coach" action.
 *
 * Mechanically moved out of src/app.js. Every screens/season/*.mjs module
 * that mutates season data calls `replaceSeasonData`, and index.mjs calls
 * `loadSeason` — living here rather than under any one tab avoids the tab
 * modules importing each other.
 */
import { state } from "../../core/state.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { teamLeagueOptions } from "../../domain/roster/team-rules.mjs";
import { emptyBuilderState } from "../../data/roster-draft.mjs";

/**
 * Fetch the season, signed in or not.
 *
 * This used to return an empty season for a signed-out visitor without asking
 * the server at all, which was correct while /api/season answered 401. Since
 * step 10.3 it answers the public half — the table, the schedule, the results —
 * and short-circuiting here would have made that change invisible.
 */
export async function loadSeason(force = false) {
  if (state.season.loaded && !force) return;
  state.season.loading = true;
  state.season.error = "";
  try {
    state.season.data = await apiRequest("/api/season");
    state.season.loaded = true;
  } catch (error) {
    state.season.error = error.message;
  } finally {
    state.season.loading = false;
  }
}

/** Apply a server response after a mutation, without a full reload. */
export function replaceSeasonData(payload) {
  state.season.data = payload;
  state.season.loaded = true;
}

export function makeSeasonStarterRoster(team, name) {
  const draft = emptyBuilderState(team);
  draft.teamName = name || team.title;
  draft.selectedLeague = teamLeagueOptions(team)[0] ?? "";
  return draft;
}

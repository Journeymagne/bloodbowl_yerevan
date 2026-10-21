/**
 * A coach's entry into the season (stage 12, decision 22): what the call on a team's pages offers, and the one write.
 *
 * The 2.x season screen entered a team from a list of the coach's teams; since stage 12 the team's own pages do it —
 * the overview's and «Matches»' call «Not entered in the season» carries the button (screens/season/enter.mjs). The
 * server keeps one team of a coach in a season (`season_entries_active_user_idx`), so a coach whose other team plays
 * it is told so instead of being offered a button the server would refuse.
 *
 * The write keeps the rules every write to the account keeps (stage 05, R12; Review Focus 1): another tab's token
 * sends nothing; one entry is on its way at a time, a second press while it is sends nothing; an answer that does not
 * come back is never sent again — the season and the coach's teams are read again, and the page shows what the server
 * holds.
 */
import { refusalText } from "../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { loadSeason, replaceSeasonData } from "../screens/season/season-data.mjs";
import { loadMyTeams, unanswered } from "./teams.mjs";

/** The entry on its way, or null: one at a time for the page. */
let entering = null;

/** The team has an entry in the season that is not withdrawn. */
const entered = (seasonData, teamId) => (seasonData?.entries ?? []).some((entry) => entry.team?.id === teamId && !entry.withdrawnAt);

/**
 * What the call to enter the season says of a team (decision 22): `enter` — the button; `taken` — another team of the
 * coach's plays this season (`other`, the name the coach's list gives it, the entry's when the list does not have it),
 * no button; null — the team is in the season, or the season is not read, and nothing is said it could contradict.
 * A withdrawn entry is outside the season: the team may be entered again.
 *
 * @param {string} teamId
 * @param {object|null} seasonData `/api/season`'s answer
 * @param {{id: string, name: string}[]} [myTeams] the coach's teams
 * @returns {{kind: "enter"}|{kind: "taken", other: string}|null}
 */
export function seasonCallFor(teamId, seasonData, myTeams = []) {
  if (!seasonData) return null;
  if (entered(seasonData, teamId)) return null;
  const mine = seasonData.myEntry;
  if (!mine?.team) return { kind: "enter" };
  if (mine.team.id === teamId) return null;
  const listed = myTeams.find((team) => team.id === mine.team.id);
  return { kind: "taken", other: listed?.name || mine.team.name || "" };
}

/** The season as it stands now: a read already on its way may have gone before the entry did; it lands first. */
async function readSeasonAgain() {
  if (state.season.loading) await loadSeason();
  await loadSeason(true);
}

/**
 * Enter `teamId` into the season (`POST /api/season/commit`). The answer is the season: it is put in place (after a
 * read of it already on its way, which may be older), and the coach's teams are read again; the entry is said made
 * only when the season holds it. A refusal is the server's words; a conflict (the coach or the team entered from
 * another tab) reads the season again, so the call says what is so. Never throws.
 *
 * @param {string} teamId
 * @returns {Promise<{entered: true}|{refusal: string, unknown?: true}>} `refusal: ""` — nothing to say: a press while an
 *   entry is on its way (nothing sent), or an answer for a coach who is no longer the one signed in
 */
export async function enterSeason(teamId) {
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  if (entering) return { refusal: "" };
  const mine = {};
  entering = mine;
  const userId = state.auth.currentUser?.id;
  const sender = () => state.auth.currentUser?.id === userId;
  try {
    let answer;
    try {
      answer = await apiRequest("/api/season/commit", { method: "POST", body: JSON.stringify({ teamId }) });
    } catch (error) {
      if (unanswered(error)) {
        await Promise.allSettled([readSeasonAgain(), loadMyTeams(true)]);
        return { refusal: t("teamOverview.enterUnknown"), unknown: true };
      }
      if (error?.status === 409) await readSeasonAgain();
      return { refusal: refusalText(error) };
    }
    if (state.season.loading) await loadSeason();
    // Signed out, or in as someone else, while the answer was on its way: it is not theirs; read theirs instead. An
    // answer that is no season (a proxy's, a server that said nothing) is read again too: the season says what is so.
    if (answer?.season && sender()) replaceSeasonData(answer);
    else await loadSeason(true);
    await loadMyTeams(true);
    if (!sender()) return { refusal: "" };
    return entered(state.season.data, teamId) ? { entered: true } : { refusal: t("teamOverview.enterUnknown"), unknown: true };
  } finally {
    if (entering === mine) entering = null;
  }
}

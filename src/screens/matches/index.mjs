/**
 * The «Matches» tab of a team (`#/t/:id/matches`, stage 09a): the match on as a card, «Friendlies», the season's results
 * and what comes later in it (Matches.html, MatchesLive.html, MatchesPrePlus.html). It replaces 2.x's «My games» on this
 * address; that screen draws the challenges alone until stage 09c (decision 3).
 *
 * `matchesModel` (model.mjs) says what the page says; the card is card.mjs's, the lists lists.mjs's. One form for each
 * width, as the overview (decision 1): the model is told whether the screen is a phone's each time it is drawn, and the
 * screen is drawn again when the width crosses 900px.
 *
 * The visit reads the games afresh on the way in and whenever the tab is seen again (decision 9: a match's phase is not
 * judged by an old list), the table once, the opponent of the match on from his public page (once for the game as it
 * stands: the band's part, `bandVisit`) and the team's records while a match is on — once, and again when the games
 * change, one read in the air. No timer polls. The inducements' tile and the line of who is out open «Before the match»;
 * a tile closed for an opponent not read says why when it is pressed. Leaving closes the sheet and stops listening.
 */
import { announce } from "../../components/live-region.mjs";
import { delegate, drawKeepingFocus, escapeHtml, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { seasonTabUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { loadGames, onGamesChange } from "../../data/games.mjs";
import { readTeamRecords } from "../../data/match-day.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { currentMatch } from "../../shell/current-match.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { isPhone, onPhoneChange } from "../team/roster/screen.mjs";
import { bandVisit } from "./band.mjs";
import { currentCardMarkup, noMatchMarkup } from "./card.mjs";
import { matchesModel, phaseOf } from "./model.mjs";
import { othersMarkup, resultsMarkup } from "./lists.mjs";

/** The reads that failed, in danger callouts, as an alert. */
function failuresMarkup(failures) {
  if (!failures.length) return "";
  return `<div class="g-matches__failed" role="alert">${failures.map((title) => renderCallout({ tone: "danger", title })).join("")}</div>`;
}

/** «Friendlies» (Matches.html): the way to the challenges, before a match or with none on. */
function friendliesMarkup(model) {
  const phase = model.current?.phase;
  if (!model.gamesRead || (phase && phase !== "idle" && phase !== "preparing")) return "";
  return `<a class="g-matches__friendlies" href="${escapeHtml(teamUrl(model.teamId, "challenges"))}">${icon("plus", 18)}${escapeHtml(t("teamOverview.friendlies"))}</a>`;
}

/** Outside the table, the call to enter the season (decision 8), under the card when there is one (pre-flight L9). */
function seasonCallMarkup(model) {
  if (!model.seasonRead || model.inSeason) return "";
  return renderCallout({ title: t("teamOverview.notInSeason"), sub: t("teamOverview.notInSeasonSub"), href: seasonTabUrl("registration") });
}

/** The match on, or the word that the round has none for the team yet; nothing otherwise. */
function currentMarkup(model) {
  if (model.current) return currentCardMarkup(model.current);
  return model.pendingRound ? noMatchMarkup() : "";
}

/**
 * The page, as Matches.html orders it: the match on, the call to enter the season, «Friendlies», «Results», «Later in
 * the season».
 * @param {ReturnType<typeof matchesModel>} model
 */
export function matchesMarkup(model) {
  const head = renderPageHead({ title: t("matches.title") });
  const lists = model.gamesRead ? resultsMarkup(model.results, model.record) + othersMarkup(model.others, model.nextRound) : "";
  return `${head}<div class="g-matches">${failuresMarkup(model.failures)}${currentMarkup(model)}${seasonCallMarkup(model)}`
    + `${friendliesMarkup(model)}${lists}</div>`;
}

/** The team `teamId` in the coach's list; undefined once it is not there. */
const listed = (teamId) => state.myTeams.items.find((item) => item.id === teamId);

/**
 * The page of `teamId` as the state has it now; "" when the team is not in the coach's list, and the screen is left as it
 * was. A failure an earlier read left, which the read repeating it has not answered yet, is not drawn (`held`).
 */
function markupOf(teamId, held, band, records) {
  const team = listed(teamId);
  if (!team) return "";
  const { items, loaded, error } = state.games;
  return matchesMarkup(matchesModel({
    team, raceTeam: raceTeamOf(team.baseTeamSlug), seasonData: state.season.data,
    games: loaded && !held.games ? items : null, gamesError: held.games ? "" : error, seasonError: held.season ? "" : state.season.error,
    opponent: band.opponent, records, data: state.data, phone: isPhone(),
  }));
}

/** `listener` on `target` for `type`; what removes it again. */
function listen(target, type, listener) {
  target?.addEventListener?.(type, listener);
  return () => target?.removeEventListener?.(type, listener);
}

/**
 * The records of the team while a match is on (decision 5): read once the games have answered and on every answer of
 * theirs after it, one read in the air and one more for the answers it missed; none while no match is on.
 * @param {{teamId: string, here: () => boolean, games: () => object[]|null, draw: () => void}} props
 */
function recordsVisit({ teamId, here, games, draw }) {
  const records = { last: null, reading: false, again: false, armed: false };
  const playing = () => {
    const current = Array.isArray(games()) ? currentMatch(games(), teamId) : null;
    return Boolean(current) && ["live", "post"].includes(phaseOf(current));
  };
  const read = async () => {
    if (!here() || !records.armed || !playing()) return;
    if (records.reading) {
      records.again = true;
      return;
    }
    records.reading = true;
    const answer = await readTeamRecords(teamId);
    records.reading = false;
    if (!here()) return;
    records.last = answer;
    draw();
    if (records.again) {
      records.again = false;
      void read();
    }
  };
  return { get last() { return records.last; }, read, arm() { records.armed = true; void read(); } };
}

/**
 * The matches page of one of the coach's teams. Drawn at once from the state, the title taking the focus; again when the
 * games and the table come, whenever the games change while the coach is here, when the opponent or the records are
 * read, and when the width crosses 900px — the later draws patch the page, so the focus stays where the coach put it.
 * @param {string} teamId
 */
export async function renderTeamMatches(teamId) {
  let here = true;
  const held = { games: Boolean(state.games.error), season: Boolean(state.season.error) };
  const gamesNow = () => (state.games.loaded && !held.games ? state.games.items : null);
  const draw = () => {
    if (!here) return;
    const markup = markupOf(teamId, held, band, records.last);
    if (markup) patch(view, markup);
  };
  const band = bandVisit({ teamId, root: view, draw, read: () => ({ team: listed(teamId), games: gamesNow(), seasonData: state.season.data, data: state.data }) });
  const records = recordsVisit({ teamId, here: () => here, games: gamesNow, draw });
  const offs = [
    onGamesChange(() => {
      held.games = false;
      band.gamesChanged();
      draw();
      void records.read();
    }),
    onPhoneChange(() => drawKeepingFocus(view, draw, "h1")),
    listen(globalThis.document, "visibilitychange", () => {
      if (globalThis.document.visibilityState === "visible") void loadGames(true);
    }),
    delegate(view, "click", "[data-before-closed]", (event, tile) => announce(tile.getAttribute("data-before-closed"))),
    () => band.release(),
  ];
  onScreenLeave("team-matches", () => {
    here = false;
    for (const off of offs) off();
  });
  const reads = Promise.allSettled([loadGames(true), loadSeason(held.season)]);
  const first = markupOf(teamId, held, band, records.last);
  if (first) {
    view.innerHTML = first;
    view.querySelector("h1")?.focus();
  }
  await reads;
  held.games = false;
  held.season = false;
  band.gamesChanged();
  draw();
  records.arm();
}

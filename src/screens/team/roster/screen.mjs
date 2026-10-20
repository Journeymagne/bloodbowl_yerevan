/**
 * What the roster screen draws for a visit (moved out of index.mjs unchanged, stage 07d): the mode the games put the
 * roster in, why no counter takes a step just now, the lines the draft and the records make, and the `RosterScreen`
 * view.mjs draws. It reads the visit (`Visit`, index.mjs), the games, the save queue and the memory; what it writes is
 * the visit's sheet, which it closes when its player or its match has left the screen, and in the player mode (stage
 * 07d) the player the coach chose: the address's, once his line is first there. And where the page stands when the
 * screen drawn is another (a patch across 900px in the player mode) or the way back from a player's page is taken.
 */
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { patchWithModal } from "../../../components/dialog.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { raceTeamOf } from "../../../data/teams.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { fallenWriting } from "./fallen.mjs";
import { sessionSppOf } from "./memory.mjs";
import { fallenLines, rosterLines, rosterMode, sortLines } from "./model.mjs";
import { saveState } from "./save.mjs";
import { sheetOf } from "./injury.mjs";
import { recordsOf } from "./match-taps.mjs";
import { markSheetOf } from "./marks.mjs";
import { marketSheetOf } from "./market.mjs";
import { playerSheetOf } from "./player.mjs";

/** The width up to which a player's button opens his row; from 901px it chooses him for the panel. */
export const PHONE = "(max-width: 900px)";
/** Read when the screen is drawn; a page with no window to ask (a test) is a desk. */
export const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE)?.matches);

/** What the roster is for just now, by the games as last read (`rosterMode`). */
export const modeOf = (teamId) => rosterMode(state.games.loaded ? state.games.items ?? [] : [], teamId);

/** The games are read and say what they say: until then a step might go into a match (plan 07a, decision 18). */
export const gamesKnown = () => state.games.loaded && !state.games.loading && !state.games.error;

/** A read of the visit is in the air. */
export const reading = (visit) => visit.answered !== visit.reads;

/**
 * Why no counter takes a step just now, "" when none: the games unread or unreadable, or to be read after the roster
 * in the air (`readWithGames`); the records read during a match or after one ended (fix round 1: a read may land with
 * a tap already in it, and a roster read during the match is no roster to save); a death on its way (K7: a step taken
 * now would go on the revision it moves, and its answer would give that step up); another device's save to settle.
 */
export function lockOf(teamId, save, visit, mode) {
  if (!state.games.loaded || state.games.loading) return t("teamRoster.gamesLoading");
  if (state.games.error) return state.games.error;
  if (reading(visit)) return t(mode.kind === "match" || visit.stale ? "teamRoster.readingRecords" : "teamRoster.gamesLoading");
  if (fallenWriting(teamId)) return t("teamRoster.mark.writing");
  return save.status === SAVE_STATUS.CONFLICT ? t("teamRoster.conflict.title") : "";
}

/** An injury's answer was lost and no read is in the air: the one that followed failed (R14, fix round 1). */
export const unsureOf = (visit) => visit.unsure && !reading(visit);

/** «Edit outside the match» is on for the match on: the switch is the team's and that match's (R13). */
export const outsideOf = (memory, mode) => mode.kind === "match" && memory.outside === mode.game.id;

/**
 * The race of the visit's team, the queue's draft as drawn (normalised), and its lines in the roster's own order for
 * `mode`: what the draft, the records and the taps on their way say, and nothing more; then the fallen the roster drawn
 * does not hold, in the server's order (decision 21: a player is drawn once, on the roster, when a read caught him on both).
 */
export function linesOf(visit, mode) {
  const race = visit.team ? raceTeamOf(visit.team.baseTeamSlug) : null;
  const draft = normalizeDraft(visit.draft ?? visit.team?.roster ?? {});
  const lines = race ? rosterLines({ draft, race, events: [...visit.events, ...visit.pending], mode, skillGroups: state.data?.skillGroups ?? null }) : [];
  return { race, draft, lines, fallen: fallenLines({ fallen: visit.fallen, race, rosterIds: lines.map(({ id }) => id) }) };
}

/**
 * Who keeps or closes a sheet of each kind: marks.mjs a missed match's and a death's undo, market.mjs the cart and a sale,
 * player.mjs a player's edit and his advancement (stage 07d); injury.mjs the rest.
 */
const KEEPERS = { mark: markSheetOf, undo: markSheetOf, hire: marketSheetOf, sell: marketSheetOf, edit: playerSheetOf, advance: playerSheetOf };

/** @returns {import("./view.mjs").RosterScreen} */
export function screenOf(teamId, visit, memory) {
  const mode = modeOf(teamId);
  const outside = outsideOf(memory, mode);
  const { race, draft, lines: own, fallen: dead } = linesOf(visit, mode);
  const lines = sortLines(own, memory.sort).map((line) => ({ ...line, sessionSpp: sessionSppOf(memory, line), sessionOutside: sessionSppOf(memory, line, { outside: true }) }));
  const fallen = sortLines(dead, memory.sort);
  const save = saveState(teamId);
  const where = { mode, outside, lock: lockOf(teamId, save, visit, mode), sideLocked: visit.sideLocked, unsure: unsureOf(visit), save, race, draft };
  // A sheet whose player has left the screen (read again) closes with him; an injury's, with its match (injury.mjs); a
  // mark's, with a match begun or the mark taken (marks.mjs); the cart, with a match begun (market.mjs); a player's edit and his
  // advancement, with a match begun (player.mjs). A fallen player's chip opens a skill's sheet too.
  const sheet = (KEEPERS[visit.sheet?.kind] ?? sheetOf)(visit, [...lines, ...fallen], where);
  if (!sheet) Object.assign(visit, { sheet: null, opener: null });
  // The player mode: his row open on a phone, him in the panel on a desk — once, so that the coach's next choice stands.
  const his = visit.player && !visit.chosen ? [...lines, ...fallen].find((line) => line.id === visit.player) : null;
  if (his) {
    memory.selected = his.key;
    visit.chosen = true;
  }
  return {
    teamId, team: visit.team, race, data: state.data, lines, fallen, memory, sheet, error: visit.error, loading: visit.loading, phone: isPhone(),
    ...where, records: recordsOf(visit, mode), player: visit.player, rolls: visit.rolls,
  };
}

/** The screen drawn in the view, as its root names it (`data-screen`). */
const drawnScreen = () => view.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;

/**
 * The visit drawn again as a patch, a sheet that is open kept open (`modal`). Another screen than the one drawn — the
 * width crossing 900px in the player mode, the profile in the roster's place or back (M6) — starts at the top of the
 * page, as `drawScreen` starts one.
 * @param {string} markup @param {string} modal the open sheet's selector, "" for none
 */
export function patchVisit(markup, modal) {
  const before = drawnScreen();
  patchWithModal(view, markup, modal);
  if (drawnScreen() !== before) globalThis.scrollTo?.(0, 0);
}

/**
 * The way back from a player's page (K4): the roster's page where the coach left it, and the focus on the row that is
 * open, without scrolling (M5) — a keyboard goes on from there, not from the title at the top; no row open, the focus
 * stays where it is.
 * @param {number} at the roster's `scrollY` when the coach left it
 */
export function putBack(at) {
  globalThis.scrollTo?.(0, at);
  view.querySelector('[data-row-key][aria-expanded="true"]')?.focus({ preventScroll: true });
}

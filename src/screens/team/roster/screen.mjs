/**
 * What the roster screen draws for a visit (moved out of index.mjs unchanged, stage 07d): the mode the games put the
 * roster in, why no counter takes a step just now, the lines the draft and the records make, and the `RosterScreen`
 * view.mjs draws. It reads the visit (`import("./index.mjs").Visit`), the games, the save queue and the memory; what it
 * writes is the visit's sheet and what opened it (`opener`), both let go when the sheet's player or its match has left
 * the screen, and in the player mode (stage 07d) the player the coach chose: the address's, once his line is first
 * there, with a search's query that would hide him cleared (search.mjs). A sheet's keeper may say why it let one go, in a toast: a player's undo, edit or fix whose player changed
 * under it (player.mjs, player-save.mjs). And where the page stands when the screen drawn is another (a patch across
 * 900px in the player mode) or the way back from a player's page is taken.
 */
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { raceTeamOf } from "../../../data/teams.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { patchWithModal } from "../../../ui/sheet.mjs";
import { fallenWriting } from "./fallen.mjs";
import { sessionSppOf } from "./memory.mjs";
import { fallenLines, rosterLines, rosterMode, sortLines } from "./model.mjs";
import { saveState, savedIdentity } from "./save.mjs";
import { adminOf } from "./source.mjs";
import { adminSheetOf, adminWriting } from "./admin-block.mjs";
import { keyed, sheetOf } from "./injury.mjs";
import { recordsOf } from "./match-taps.mjs";
import { markSheetOf } from "./marks.mjs";
import { marketSheetOf } from "./market.mjs";
import { playerSheetOf } from "./player.mjs";
import { yieldQuery } from "./search.mjs";

/** The width up to which a player's button opens his row; from 901px it chooses him for the panel. */
export const PHONE = "(max-width: 900px)";
/** Read when the screen is drawn; a page with no window to ask (a test) is a desk. */
export const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE)?.matches);

/**
 * `listener` each time the width crosses 900px (the query's `change`), for a screen that draws one form for each width
 * (the overview, stage 07d); and what takes it off. A page with no window to ask, or a query that cannot be listened
 * to, never crosses: nothing is heard and nothing is to take off.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function onPhoneChange(listener) {
  const media = globalThis.matchMedia?.(PHONE);
  if (typeof media?.addEventListener !== "function") return () => {};
  media.addEventListener("change", listener);
  return () => media.removeEventListener?.("change", listener);
}

/** An admin's visit (stage 12, decision 23) has no match and no preparation: the admin repairs the roster, a step is a save of it. */
const ADMIN_MODE = Object.freeze({ kind: "plain" });

/**
 * What the roster is for just now, by the games as last read (`rosterMode`); on an admin's visit always a save of the
 * roster (the repair path, plan 09a's question 2): the games read are the admin's, not the team's.
 */
export const modeOf = (teamId) => (adminOf(teamId) ? ADMIN_MODE : rosterMode(state.games.loaded ? state.games.items ?? [] : [], teamId));

/** The games are read and say what they say: until then a step might go into a match (plan 07a, decision 18). */
export const gamesKnown = () => state.games.loaded && !state.games.loading && !state.games.error;

/** A read of the visit is in the air. */
export const reading = (visit) => visit.answered !== visit.reads;

/**
 * Why no counter takes a step just now, "" when none: the games unread or unreadable, or to be read after the roster
 * in the air (`readWithGames`); the records read during a match or after one ended (fix round 1: a read may land with
 * a tap already in it, and a roster read during the match is no roster to save); a death on its way (K7: a step taken
 * now would go on the revision it moves, and its answer would give that step up), or an admin's fix of the treasury
 * (stage 12, admin-block.mjs: the same reason); another device's save to settle.
 */
export function lockOf(teamId, save, visit, mode) {
  if (!state.games.loaded || state.games.loading) return t("teamRoster.gamesLoading");
  if (state.games.error) return state.games.error;
  if (reading(visit)) return t(mode.kind === "match" || visit.stale ? "teamRoster.readingRecords" : "teamRoster.gamesLoading");
  if (fallenWriting(teamId)) return t("teamRoster.mark.writing");
  if (adminWriting(teamId)) return t("adminTeam.treasury.writing");
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
 * player.mjs a player's edit, his advancement, the undo of his last one and his fix by hand (stage 07d), admin-block.mjs the
 * admin's fallen player added afterwards (stage 12); injury.mjs the rest.
 */
const KEEPERS = {
  mark: markSheetOf, undo: markSheetOf, hire: marketSheetOf, sell: marketSheetOf, edit: playerSheetOf, advance: playerSheetOf, unadvance: playerSheetOf,
  fix: playerSheetOf, adminFallen: adminSheetOf,
};

/**
 * @param {string} teamId @param {import("./index.mjs").Visit} visit @param {import("./memory.mjs").RosterMemory} memory
 * @returns {import("./view.mjs").RosterScreen}
 */
export function screenOf(teamId, visit, memory) {
  const mode = modeOf(teamId);
  const outside = outsideOf(memory, mode);
  const { race, draft, lines: own, fallen: dead } = linesOf(visit, mode);
  const lines = sortLines(own, memory.sort).map((line) => ({ ...line, sessionSpp: sessionSppOf(memory, line), sessionOutside: sessionSppOf(memory, line, { outside: true }) }));
  const fallen = sortLines(dead, memory.sort);
  const save = saveState(teamId);
  // `admin` is the admin's visit (source.mjs), null for the coach's: its sheets offer no roll on the site and undo any death.
  const where = { mode, outside, lock: lockOf(teamId, save, visit, mode), sideLocked: visit.sideLocked, unsure: unsureOf(visit), save, race, draft, admin: adminOf(teamId) };
  // A sheet whose player has left the screen (read again) closes with him; an injury's, with its match (injury.mjs); a
  // mark's, with a match begun or the mark taken (marks.mjs); the cart, with a match begun (market.mjs); a player's edit and his
  // advancement, with a match begun (player.mjs). A fallen player's chip opens a skill's sheet too.
  const sheet = (KEEPERS[visit.sheet?.kind] ?? sheetOf)(visit, [...lines, ...fallen], where);
  if (!sheet) Object.assign(visit, { sheet: null, opener: null });
  // The player mode: his row open on a phone, him in the panel on a desk — once, so that the coach's next choice stands; a
  // query kept from a desk that would hide him gives way (search.mjs).
  const his = visit.player && !visit.chosen ? [...lines, ...fallen].find((line) => line.id === visit.player) : null;
  if (his) {
    memory.selected = his.key;
    visit.chosen = true;
    yieldQuery(memory, his);
  }
  // An admin's change of the name or the logo is drawn at once, as a step's draft is (save.mjs, `stepIdentity`).
  const team = where.admin && visit.team ? { ...visit.team, ...savedIdentity(teamId) } : visit.team;
  return {
    teamId, team, race, data: state.data, lines, fallen, memory, sheet, error: visit.error, loading: visit.loading, phone: isPhone(),
    ...where, records: recordsOf(visit, mode), player: visit.player, rolls: visit.rolls, careers: visit.careers, careerOpen: visit.careerOpen,
    owner: visit.admin?.owner ?? null, inMatch: Boolean(visit.admin?.inMatch), matches: visit.admin?.matches ?? [],
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
 * The way back from a player's page (K4): the roster's page where the coach left it, and the focus on the row of the
 * player the coach had chosen — his open row on a phone, on a desk his row's own button, which opens no row (final
 * wave, T7 N1) — without scrolling (M5): a keyboard goes on from there, not from the title at the top. None chosen, or
 * he is no longer drawn, the focus stays where it is.
 * @param {number} at the roster's `scrollY` when the coach left it @param {string|null} selected his row's key (`memory.selected`)
 */
export function putBack(at, selected) {
  globalThis.scrollTo?.(0, at);
  if (selected) keyed("data-row-key", selected)?.focus({ preventScroll: true });
}

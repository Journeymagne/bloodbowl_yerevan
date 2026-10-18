/**
 * The team's roster (`#/t/:id/roster`, plan 3.0, 7a): the table, a player's row that opens on a phone and the
 * panel beside it on a desk, the skills and their rules. What a line says is model.mjs's, the markup
 * view/panel/sheets', the writes save/taps'; this file reads, draws and lives as long as the visit. The player's
 * own address (`#/t/:id/roster/:playerId`) still draws the 2.x editor until stage 07d, and the roster leads there
 * for what it does not do yet.
 */
import { drawScreen } from "../../../core/dom.mjs";
import { onScreenLeave } from "../../../core/screen-lifecycle.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { patchWithModal } from "../../../components/dialog.mjs";
import { loadGames, onGamesChange } from "../../../data/games.mjs";
import { raceTeamOf } from "../../../data/teams.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { readRoster } from "./data.mjs";
import { rosterMemory } from "./memory.mjs";
import { nextSort, rosterLines, rosterMode, sortLines } from "./model.mjs";
import { SKILL_SHEET } from "./sheets.mjs";
import { rosterMarkup } from "./view.mjs";
import { wireRoster } from "./wire.mjs";

/** The width up to which a player's button opens his row; from 901px it chooses him for the panel. */
const PHONE = "(max-width: 900px)";
/** Read when the screen is drawn; a page with no window to ask (a test) is a desk. */
const isPhone = () => Boolean(globalThis.matchMedia?.(PHONE)?.matches);

/**
 * The team whose roster was drawn last. drawScreen keeps the page where it is for the same screen drawn again (a
 * language switch); another team's roster, which the team switcher opens from this one, is another page and starts
 * at its top.
 */
let shownTeam = null;

/** `listener` on `target` for `type`, and what takes it off; a target that cannot be listened to is none. */
function listen(target, type, listener) {
  target?.addEventListener?.(type, listener);
  return () => target?.removeEventListener?.(type, listener);
}

/**
 * What one visit holds: the team and its events as last read, whether the first answer is still awaited, the
 * failure it brought, the sheet that is open and the chip that opened it. A new object for every visit, so an
 * answer that comes after the coach left finds its own visit closed.
 * @typedef {object} Visit
 * @property {boolean} here @property {boolean} drawn @property {boolean} loading @property {string} error
 * @property {object|null} team @property {object[]} events @property {object|null} sheet
 * @property {Element|null} opener @property {number} reads the number of the read whose answer is drawn
 */

/** @returns {import("./view.mjs").RosterScreen} */
function screenOf(teamId, visit, memory) {
  const race = visit.team ? raceTeamOf(visit.team.baseTeamSlug) : null;
  const mode = rosterMode(state.games.loaded ? state.games.items ?? [] : [], teamId);
  const lines = race ? sortLines(rosterLines({ draft: normalizeDraft(visit.team.roster ?? {}), race, events: visit.events, mode }), memory.sort) : [];
  // A sheet whose player has left the roster (read again) closes with him.
  if (visit.sheet && !lines.some((line) => line.key === visit.sheet.key)) visit.sheet = null;
  return { team: visit.team, race, data: state.data, lines, mode, memory, sheet: visit.sheet, error: visit.error, loading: visit.loading, phone: isPhone() };
}

/** A focus whose element a redraw took away goes to the title, where a keyboard starts from. */
function keepFocus() {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) view.querySelector("h1")?.focus();
}

/**
 * What a press does: a header sorts, a player's button opens his row (a phone) or chooses him for the panel (a desk),
 * a chip opens its skill's sheet and the sheet's close gives the focus back to it, «Try again» reads again.
 * @param {{memory: object, visit: Visit, draw: Function, read: Function}} screen `draw` draws the visit again, `read` reads the roster again
 */
function pressHandlers({ memory, visit, draw, read }) {
  return {
    onSort: (column) => {
      memory.sort = nextSort(memory.sort, column);
      draw();
    },
    // A phone opens the row and closes it again; a desk chooses the player for the panel, and a second press keeps him.
    onToggle: (key) => {
      memory.selected = isPhone() && memory.selected === key ? null : key;
      draw();
    },
    onSkill: (key, name, chip) => {
      Object.assign(visit, { sheet: { kind: "skill", key, name }, opener: chip });
      draw();
    },
    onSheetClose: (id) => {
      if (id !== SKILL_SHEET) return;
      const { opener } = visit;
      Object.assign(visit, { sheet: null, opener: null });
      draw();
      if (opener?.isConnected) opener.focus();
    },
    onRetry: () => {
      Object.assign(visit, { loading: true, error: "" });
      draw();
      keepFocus();
      return read();
    },
  };
}

/**
 * The roster of one of the coach's teams. Drawn at once with the wait, the title taking the focus; again when the
 * roster comes, when the games change (a match begun or ended changes what a line counts), when the width crosses
 * 900px, and on every press. The later draws patch the page, so the focus stays where the coach has put it, and a
 * sheet that is open stays open.
 * @param {string} teamId
 */
export async function renderTeamRoster(teamId) {
  const memory = rosterMemory(teamId);
  /** @type {Visit} */
  const visit = { here: true, drawn: false, loading: true, error: "", team: null, events: [], sheet: null, opener: null, reads: 0 };
  const draw = () => {
    if (!visit.here) return;
    const markup = rosterMarkup(screenOf(teamId, visit, memory));
    if (visit.drawn) {
      patchWithModal(view, markup, visit.sheet ? `#${SKILL_SHEET}` : "");
      return;
    }
    visit.drawn = true;
    const another = shownTeam !== teamId;
    shownTeam = teamId;
    drawScreen(view, markup);
    if (another) globalThis.scrollTo?.(0, 0);
    view.querySelector("h1")?.focus();
  };
  const read = async () => {
    const ticket = ++visit.reads;
    const answer = await readRoster(teamId);
    if (!visit.here || ticket !== visit.reads) return;
    visit.loading = false;
    visit.error = answer.error ?? "";
    if (!answer.error) Object.assign(visit, { team: answer.team, events: answer.events });
    draw();
  };
  const offs = [];
  // Registered first: the visit before this one (the same route drawn again) is released before this one is wired.
  onScreenLeave("team-roster", () => {
    visit.here = false;
    while (offs.length) offs.pop()();
  });
  offs.push(
    wireRoster(view, pressHandlers({ memory, visit, draw, read })),
    onGamesChange(draw),
    listen(globalThis.matchMedia?.(PHONE), "change", draw),
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") void loadGames(true);
    }),
  );
  draw();
  await Promise.all([read(), loadGames(true)]);
}

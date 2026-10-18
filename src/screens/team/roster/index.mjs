/**
 * The team's roster (`#/t/:id/roster`, plan 3.0, 7a): the table, a player's row that opens on a phone and the
 * panel beside it on a desk, the skills and their rules. What a line says is model.mjs's, the markup
 * view/panel/sheets', the writes save/taps'; this file reads, draws and lives as long as the visit. The player's
 * own address (`#/t/:id/roster/:playerId`) still draws the 2.x editor until stage 07d, and the roster leads there
 * for what it does not do yet.
 *
 * Outside a match a counter's step is a save of the roster (save.mjs), drawn at once from the queue's draft. The
 * queue outlives the visit: what waits for the network is sent again on entry and when the network is back, and
 * never while a match is on (R8): a PATCH during a match breaks its finish (POST_TEAM_CHANGED), so a match that
 * begins while steps wait gives them up for the server's roster, and the coach is told to make them again.
 */
import { API_ERROR } from "../../../core/api.mjs";
import { drawScreen } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { onScreenLeave } from "../../../core/screen-lifecycle.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { patchWithModal } from "../../../components/dialog.mjs";
import { toast } from "../../../components/toast.mjs";
import { loadGames, onGamesChange } from "../../../data/games.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { raceTeamOf } from "../../../data/teams.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { readRoster } from "./data.mjs";
import { rosterMemory, sessionSppOf } from "./memory.mjs";
import { nextSort, rosterLines, rosterMode, sortLines, stepRule } from "./model.mjs";
import { onSaveState, retrySaves, saveState, stepSpp, takeServerTeam, trackRoster } from "./save.mjs";
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
 * What one visit holds. A new object for every visit, so an answer that comes after the coach left finds its own
 * visit closed.
 * @typedef {object} Visit
 * @property {boolean} here
 * @property {boolean} drawn
 * @property {boolean} loading the first answer is awaited
 * @property {string} error the failure the read brought
 * @property {object|null} team the team as last read
 * @property {object|null} draft the roster the save queue holds for it, steps not yet answered included: what is drawn
 * @property {object[]} events the records not settled, as last read
 * @property {object|null} sheet the sheet that is open
 * @property {Element|null} opener the chip that opened it
 * @property {number} reads the number of the last read sent
 * @property {number} answered the number of the last read answered: less than `reads` while one is in the air
 * @property {string} status the save queue's status as last heard, "" before
 * @property {boolean} retake the server's roster was to be taken while a request was in the air: asked again when it answers
 * @property {(() => void)|null} saveOff stops hearing the queue
 */

/** What the roster is for just now, by the games as last read (`rosterMode`). */
const modeOf = (teamId) => rosterMode(state.games.loaded ? state.games.items ?? [] : [], teamId);

/** The games are read and say what they say: until then a step might go into a match (plan 07a, decision 18). */
const gamesKnown = () => state.games.loaded && !state.games.loading && !state.games.error;

/** Why no counter takes a step just now: the games unread or unreadable, or another device's save to settle; "" when none. */
function lockOf(save) {
  if (!state.games.loaded || state.games.loading) return t("teamRoster.gamesLoading");
  if (state.games.error) return state.games.error;
  return save.status === SAVE_STATUS.CONFLICT ? t("teamRoster.conflict.title") : "";
}

/** @returns {import("./view.mjs").RosterScreen} */
function screenOf(teamId, visit, memory) {
  const race = visit.team ? raceTeamOf(visit.team.baseTeamSlug) : null;
  const mode = modeOf(teamId);
  const draft = normalizeDraft(visit.draft ?? visit.team?.roster ?? {});
  const lines = race
    ? sortLines(rosterLines({ draft, race, events: visit.events, mode }), memory.sort).map((line) => ({ ...line, sessionSpp: sessionSppOf(memory, line) }))
    : [];
  // A sheet whose player has left the roster (read again) closes with him.
  if (visit.sheet && !lines.some((line) => line.key === visit.sheet.key)) Object.assign(visit, { sheet: null, opener: null });
  const save = saveState(teamId);
  return {
    team: visit.team, race, data: state.data, lines, mode, memory, sheet: visit.sheet, error: visit.error, loading: visit.loading, phone: isPhone(),
    save, lock: lockOf(save),
  };
}

/** Where the focus is before a redraw: the line it belongs to (his row, his panel, his skill's sheet) and the counter it is on. */
function focusPlace(visit) {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const cell = active.closest?.("[data-action-key]");
  const row = active.closest?.("tbody[data-key]")?.getAttribute("data-key") ?? active.closest?.("[data-panel-player]")?.getAttribute("data-panel-player")
    ?? (active.closest?.("dialog") ? visit.sheet?.key : null);
  return { row: row ?? null, counter: cell?.getAttribute("data-action-key") ?? null, player: cell?.getAttribute("data-player") ?? null };
}

/**
 * A redraw that took the focused element away, or shut it (a minus stopped at zero), gives the focus to the nearest
 * one left (Carry T9): the same counter's other button, the player's own button in the table, else the title, where a
 * keyboard starts from — never the page's body.
 */
function restoreFocus(place) {
  const active = document.activeElement;
  if (!place || (active && active !== document.body && active.isConnected && !active.hasAttribute("disabled"))) return;
  // A browser's NodeList has no `find`: spread it (the test page's lists are arrays and would not say so).
  const all = (root, selector) => [...(root?.querySelectorAll(selector) ?? [])];
  const cell = all(view, "[data-action-key]").find((item) => item.getAttribute("data-action-key") === place.counter && item.getAttribute("data-player") === place.player);
  const target = all(cell, "[data-action-step]").find((button) => !button.hasAttribute("disabled"))
    ?? all(view, "[data-row-key]").find((button) => button.getAttribute("data-row-key") === place.row)
    ?? view.querySelector("h1");
  target?.focus();
}

/**
 * The visit's side of the save queue, shared by the functions below: the route's team, the visit, the memory, and the draw.
 * @typedef {{teamId: string, visit: Visit, memory: import("./memory.mjs").RosterMemory, draw: () => void}} Saving
 */

const busy = (status) => status === SAVE_STATUS.SAVING || status === SAVE_STATUS.DIRTY;

/** The team as read, with the draft to draw; the queue is heard from now on — after each trackRoster or takeServerTeam, which a new session's queue needs (Carry T7). */
function holdTeam(saving, { team, events }, draft) {
  const { visit } = saving;
  Object.assign(visit, { team, events, draft });
  visit.saveOff?.();
  visit.saveOff = onSaveState(team.id, (now) => heardSave(saving, now));
}

/**
 * Read the team and its records again and take the server's roster in place of the coach's: after another device's
 * save, a refused one, or steps a match has made impossible. Not while a request is in the air (`takeServerTeam`
 * says null): the state the queue comes to next asks again (Carry T7 d). The coach's SPP are counted afresh.
 * @param {Saving} saving
 * @param {{dropped?: boolean}} [options] the steps that waited are given up for a match: the coach is told how many
 */
async function reloadRoster(saving, { dropped = false } = {}) {
  const { teamId, visit, memory, draw } = saving;
  const ticket = ++visit.reads;
  const answer = await readRoster(teamId);
  if (!visit.here || ticket !== visit.reads) return;
  visit.answered = ticket;
  if (answer.error) {
    toast(answer.error, { tone: "error" });
    return;
  }
  const { waiting } = saveState(teamId);
  const draft = takeServerTeam(answer.team);
  visit.retake = !draft;
  if (!draft) return;
  memory.baseline.clear();
  holdTeam(saving, answer, draft);
  draw();
  if (dropped && waiting) toast(t("teamRoster.matchDropped", { count: waiting }), { tone: "error" });
}

/**
 * The steps that wait (R8). During a match none leaves: they are given up for the server's roster, and the coach is
 * told. Outside one they are sent again when `retry` asks (on entry, the network back) — a conflict is the coach's
 * to settle first. Nothing is decided while the games are unread, a request is in the air or the roster is read.
 * @param {Saving} saving
 */
function settleWaiting(saving, { retry }) {
  const { teamId, visit } = saving;
  if (!visit.here || !visit.team || visit.answered !== visit.reads || !gamesKnown()) return;
  const { status, waiting } = saveState(teamId);
  if (!waiting || busy(status)) return;
  if (modeOf(teamId).kind === "match") void reloadRoster(saving, { dropped: true });
  else if (retry && status !== SAVE_STATUS.CONFLICT) void retrySaves(teamId);
}

/**
 * Every change of the queue's state: drawn at once; a refusal said, a 422 taking the server's roster (the steps break
 * the rules as the server reads them); a take that had to wait asked again unless a save has since landed; the
 * steps that wait settled.
 * @param {Saving} saving
 */
function heardSave(saving, now) {
  const { visit } = saving;
  const before = visit.status;
  visit.status = now.status;
  if (!visit.here) return;
  try {
    saving.draw();
    if (before && before !== SAVE_STATUS.ERROR && now.status === SAVE_STATUS.ERROR) {
      toast(now.refusal, { tone: "error" });
      if (now.kind === API_ERROR.INVALID) void reloadRoster(saving);
    } else if (visit.retake && !busy(now.status)) {
      visit.retake = false;
      if (now.status !== SAVE_STATUS.SAVED) void reloadRoster(saving);
    }
    settleWaiting(saving, { retry: false });
  } catch (error) {
    // A listener of the queue that throws would leave its request in the air for good (roster-store's notify).
    console.error(error);
  }
}

/**
 * What a press does: a header sorts, a player's button opens his row (a phone) or chooses him for the panel (a desk),
 * a chip opens its skill's sheet and the sheet's close gives the focus back to it, «Try again» reads again; a
 * counter's step outside a match saves the roster, a refused one says why, «Load the new one» takes the server's.
 * @param {Saving & {read: Function}} handlers the visit's side of the queue (`draw` draws it again), and `read`, which reads the roster again
 */
function pressHandlers({ read, ...saving }) {
  const { teamId, memory, visit, draw } = saving;
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
      return read();
    },
    // The lock is asked again: the games may have begun to be read since the counter was drawn. A step during a match is the match's (Task 11).
    onStep: (playerId, counter, delta) => {
      const { lock, lines, mode } = screenOf(teamId, visit, memory);
      const line = lines.find((item) => item.id && item.id === playerId);
      if (lock) toast(lock);
      else if (line && stepRule(line, counter, { mode, outside: memory.outside }).via === "roster") {
        const { refusal } = stepSpp(teamId, playerId, counter, delta);
        if (refusal) toast(refusal, { tone: "error" });
      }
    },
    onRefused: (reason) => toast(reason),
    onReload: () => void reloadRoster(saving),
  };
}

/**
 * The visit drawn: the first time whole, the title taking the focus (and another team's roster from the top of the
 * page); later as a patch, a sheet that is open kept open and the focus where the coach put it, or the nearest place left.
 */
function drawVisit(teamId, visit, memory) {
  if (!visit.here) return;
  const place = focusPlace(visit);
  const markup = rosterMarkup(screenOf(teamId, visit, memory));
  if (visit.drawn) {
    patchWithModal(view, markup, visit.sheet ? `#${SKILL_SHEET}` : "");
    restoreFocus(place);
    return;
  }
  visit.drawn = true;
  const another = shownTeam !== teamId;
  shownTeam = teamId;
  drawScreen(view, markup);
  if (another) globalThis.scrollTo?.(0, 0);
  view.querySelector("h1")?.focus();
}

/**
 * The roster of one of the coach's teams. Drawn at once with the wait, the title taking the focus; again when the
 * roster comes, when the games change (a match begun or ended changes what a line counts), when the width crosses
 * 900px, when the save queue moves, and on every press. The later draws patch the page, so the focus stays where the
 * coach has put it (or goes to the nearest place left), and a sheet that is open stays open.
 * @param {string} teamId
 */
export async function renderTeamRoster(teamId) {
  const memory = rosterMemory(teamId);
  memory.baseline.clear();
  /** @type {Visit} */
  const visit = {
    here: true, drawn: false, loading: true, error: "", team: null, draft: null, events: [], sheet: null, opener: null,
    reads: 0, answered: 0, status: "", retake: false, saveOff: null,
  };
  const saving = { teamId, visit, memory, draw: () => drawVisit(teamId, visit, memory) };
  const read = async () => {
    const ticket = ++visit.reads;
    const answer = await readRoster(teamId);
    if (!visit.here || ticket !== visit.reads) return;
    Object.assign(visit, { answered: ticket, loading: false, error: answer.error ?? "" });
    if (!answer.error) holdTeam(saving, answer, trackRoster(answer.team));
    saving.draw();
  };
  const offs = [];
  // Registered first: the visit before this one (the same route drawn again) is released before this one is wired.
  onScreenLeave("team-roster", () => {
    visit.here = false;
    while (offs.length) offs.pop()();
  });
  offs.push(
    () => visit.saveOff?.(),
    wireRoster(view, pressHandlers({ ...saving, read })),
    onGamesChange(() => {
      saving.draw();
      settleWaiting(saving, { retry: false });
    }),
    listen(globalThis.matchMedia?.(PHONE), "change", saving.draw),
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") void loadGames(true);
    }),
    // The network is back: the games are read first, so that no step goes into a match begun meanwhile.
    listen(globalThis, "online", async () => {
      await loadGames(true);
      settleWaiting(saving, { retry: true });
    }),
  );
  saving.draw();
  await Promise.all([read(), loadGames(true)]);
  // The steps an earlier visit left waiting go now, if no match is on: an `online` may never come (R8).
  settleWaiting(saving, { retry: true });
}

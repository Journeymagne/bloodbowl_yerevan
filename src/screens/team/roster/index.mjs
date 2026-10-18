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
 * begins while steps wait gives them up for the server's roster, and the coach is told how many SPP steps the server
 * does not have. A team is never taken on games older than it: the games are read with it, and the counters stay
 * closed until they have answered.
 *
 * During a match a step is a row the server adds (taps.mjs): a record of the match, or with «Edit outside the match»
 * an edit of the career that waits for the match's finish (Task 11). It is drawn at once as a row on its way, and its
 * answer puts the written row in its place; a failure is said once and, where the server may hold what the screen
 * does not, the records are read again — never the tap sent again.
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
import { sppEdits } from "../../../domain/post-match/events.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { readRoster } from "./data.mjs";
import { rosterMemory, sessionSppOf } from "./memory.mjs";
import { nextSort, rosterLines, rosterMode, sortLines, stepRule } from "./model.mjs";
import { onSaveState, retrySaves, saveState, stepSpp, takeServerTeam, trackRoster } from "./save.mjs";
import { SKILL_SHEET } from "./sheets.mjs";
import { sendTap } from "./taps.mjs";
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
 * @property {object[]} events the records not settled, as last read, and those the answers to taps have written since
 * @property {object[]} pending the taps on their way, as the rows they would be (`{pairingId, playerId, counter, delta}`):
 *   the lines count them at once (Review Focus 1), and each answer takes its own out
 * @property {object[]} heard the rows the answers to taps have brought, in order: a read made before one was written keeps it
 * @property {string} sideLocked the server's words for `EVENT_SIDE_LOCKED`, which close the match's own taps until the records are read again
 * @property {boolean} failed a tap of the taps on their way has failed: its words are said, and those of the taps dropped behind it are not
 * @property {boolean} reread the records are read again once the taps on their way have answered
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

/**
 * The race of the visit's team, and its lines in the roster's own order for `mode`: what the queue's draft, the
 * records and the taps on their way say, and nothing more.
 */
function linesOf(visit, mode) {
  const race = visit.team ? raceTeamOf(visit.team.baseTeamSlug) : null;
  const draft = normalizeDraft(visit.draft ?? visit.team?.roster ?? {});
  return { race, lines: race ? rosterLines({ draft, race, events: [...visit.events, ...visit.pending], mode }) : [] };
}

/** The rows of the match on that the team has, as last read and written: what its banner counts (decision 13). */
const recordsOf = (visit, mode) => (mode.kind === "match" ? visit.events.filter((event) => !event.settledAt && event.pairingId === mode.game.id).length : 0);

/** @returns {import("./view.mjs").RosterScreen} */
function screenOf(teamId, visit, memory) {
  const mode = modeOf(teamId);
  const { race, lines: own } = linesOf(visit, mode);
  const lines = sortLines(own, memory.sort).map((line) => ({ ...line, sessionSpp: sessionSppOf(memory, line) }));
  // A sheet whose player has left the roster (read again) closes with him.
  if (visit.sheet && !lines.some((line) => line.key === visit.sheet.key)) Object.assign(visit, { sheet: null, opener: null });
  const save = saveState(teamId);
  return {
    team: visit.team, race, data: state.data, lines, mode, memory, sheet: visit.sheet, error: visit.error, loading: visit.loading, phone: isPhone(),
    save, lock: lockOf(save), sideLocked: visit.sideLocked, records: recordsOf(visit, mode),
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

/**
 * The team as read, with the draft to draw; the queue is heard from now on — after each trackRoster or takeServerTeam,
 * which a new session's queue needs (Carry T7). The records are the read's and those the answers to taps have brought
 * since it was sent (`since`, a place in `visit.heard`): a read made before a tap was written does not take its row
 * away, and one made after has it once. A read of the records ends what `EVENT_SIDE_LOCKED` said.
 */
function holdTeam(saving, { team, events }, draft, since) {
  const { visit } = saving;
  const later = visit.heard.slice(since).filter((row) => !events.some((event) => event.id === row.id));
  Object.assign(visit, { team, events: [...events, ...later], draft, sideLocked: "" });
  visit.saveOff?.();
  visit.saveOff = onSaveState(team.id, (now) => heardSave(saving, now));
}

/**
 * Read the team and its records again and take the server's roster in place of the coach's: after another device's
 * save, a refused one, or steps a match has made impossible. The games are read with it, and the team is taken once
 * both have answered: a 409 is often how a coach learns that a match has begun, and a team read after its start,
 * drawn on the games from before it, would let the next tap save the roster during the match (R8). Not while a
 * request is in the air (`takeServerTeam` says null): the state the queue comes to next asks again (Carry T7 d).
 *
 * In a match the coach is told how many SPP steps of his the server does not have (a step whose answer was lost
 * may have landed: it is not one of them). After another device's save his SPP are counted afresh; after a
 * refusal or a match the server holds his saved steps as they were, and they still count.
 * @param {Saving} saving
 */
async function reloadRoster(saving) {
  const { teamId, visit, memory, draw } = saving;
  const ticket = ++visit.reads;
  const since = visit.heard.length;
  const [answer] = await Promise.all([readRoster(teamId), loadGames(true)]);
  if (!visit.here || ticket !== visit.reads) return;
  visit.answered = ticket;
  if (answer.error) {
    toast(answer.error, { tone: "error" });
    return;
  }
  const lost = sppEdits(answer.team.roster, visit.draft).length;
  const conflict = saveState(teamId).status === SAVE_STATUS.CONFLICT;
  const draft = takeServerTeam(answer.team);
  visit.retake = !draft;
  if (!draft) return;
  if (conflict) memory.baseline.clear();
  holdTeam(saving, answer, draft, since);
  draw();
  if (lost && modeOf(teamId).kind === "match") toast(t("teamRoster.matchDropped", { count: lost }), { tone: "error" });
}

/**
 * The team and its records read again, the games with them (Carry T10): after a tap whose fate is not known, a minus
 * that found nothing to take back, a match the server says is not on. The team is taken as a read takes it
 * (`trackRoster`): a step of the roster's queue that waits keeps its draft, and during a match none leaves (R8). A
 * read that fails says why and leaves the screen as it was.
 * @param {Saving} saving
 */
async function readAgain(saving) {
  const { teamId, visit } = saving;
  const ticket = ++visit.reads;
  const since = visit.heard.length;
  const [answer] = await Promise.all([readRoster(teamId), loadGames(true)]);
  if (!visit.here || ticket !== visit.reads) return;
  visit.answered = ticket;
  if (answer.error) {
    toast(answer.error, { tone: "error" });
    return;
  }
  holdTeam(saving, answer, trackRoster(answer.team), since);
  saving.draw();
  settleWaiting(saving, { retry: false });
}

/** The refusals after which the server holds what the screen does not: the records are read again. */
const READ_AGAIN = new Set(["MATCH_NOT_LIVE", "EVENT_BELOW_ZERO"]);

/**
 * A tap answered. Its row on the way is out whatever the answer (R10), and a written one joins the records. A failure
 * is the first of its taps on the way — those behind it were dropped unsent (taps.mjs) — and the only one said; once
 * they have all answered, the records are read again if the server may hold what the screen does not: an answer that
 * was lost, a minus with nothing to take back, a match that is not on (which the games read with them end). A side
 * whose Players step is saved closes the match's own taps until the records are read again (Review Focus 2).
 * @param {Saving} saving
 */
function heardTap(saving, step, answer) {
  const { visit } = saving;
  const at = visit.pending.indexOf(step);
  if (at >= 0) visit.pending.splice(at, 1);
  if (!visit.here) return;
  if (answer.event) {
    if (!visit.events.some((event) => event.id === answer.event.id)) visit.events.push(answer.event);
    visit.heard.push(answer.event);
  } else if (!visit.failed) {
    visit.failed = true;
    toast(answer.refusal, { tone: "error" });
    if (answer.code === "EVENT_SIDE_LOCKED") visit.sideLocked = answer.refusal;
    else if (answer.lost || READ_AGAIN.has(answer.code)) visit.reread = true;
  }
  if (!visit.pending.length) {
    visit.failed = false;
    if (visit.reread) void readAgain(saving);
    visit.reread = false;
  }
  saving.draw();
}

/**
 * Where a step goes (`stepRule`): outside a match it is a save of the roster (Task 10); in a match a record of it, or
 * with «Edit outside the match» an edit of the career — both rows, never a save of the roster (R8). A row is drawn at
 * once, on its way, and goes after the taps before it (taps.mjs).
 * @param {Saving} saving
 */
function takeStep(saving, line, counter, delta, mode) {
  const { teamId, visit, memory } = saving;
  const { via } = stepRule(line, counter, { mode, outside: memory.outside });
  if (via === "roster") {
    const { refusal } = stepSpp(teamId, line.id, counter, delta);
    if (refusal) toast(refusal, { tone: "error" });
    return;
  }
  const step = { pairingId: via === "match" ? mode.game.id : null, playerId: line.id, counter, delta };
  visit.pending.push(step);
  saving.draw();
  void sendTap(teamId, step).then((answer) => heardTap(saving, step, answer));
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
  if (modeOf(teamId).kind === "match") void reloadRoster(saving);
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
    const refused = before && before !== SAVE_STATUS.ERROR && now.status === SAVE_STATUS.ERROR;
    if (refused) toast(now.refusal, { tone: "error" });
    let take = refused && now.kind === API_ERROR.INVALID;
    if (visit.retake && !busy(now.status)) {
      visit.retake = false;
      take ||= now.status !== SAVE_STATUS.SAVED;
    }
    if (take) void reloadRoster(saving);
    settleWaiting(saving, { retry: false });
  } catch (error) {
    // A listener of the queue that throws would leave its request in the air for good (roster-store's notify).
    console.error(error);
  }
}

/**
 * What a press does: a header sorts, a player's button opens his row (a phone) or chooses him for the panel (a desk),
 * a chip opens its skill's sheet and the sheet's close gives the focus back to it, «Try again» reads again; a
 * counter's step saves the roster or adds a row (`takeStep`), a refused one says why, «Load the new one» takes the
 * server's, the switch makes the match's taps edits outside it and back.
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
    // The games are read with the team, so that it is not taken on games older than it (R8).
    onRetry: () => {
      Object.assign(visit, { loading: true, error: "" });
      draw();
      return Promise.all([read(), loadGames(true)]);
    },
    // The lock is asked again: the games may have begun to be read since the counter was drawn.
    onStep: (playerId, counter, delta) => {
      const lock = lockOf(saveState(teamId));
      const mode = modeOf(teamId);
      const line = linesOf(visit, mode).lines.find((item) => item.id && item.id === playerId);
      if (lock) toast(lock);
      else if (line) takeStep(saving, line, counter, delta, mode);
    },
    onRefused: (reason) => toast(reason),
    onReload: () => void reloadRoster(saving),
    // Kept for the team while the page lives (memory.mjs): a visit elsewhere and back finds it as it was.
    onOutside: (on) => {
      memory.outside = on;
      draw();
    },
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
    reads: 0, answered: 0, status: "", retake: false, saveOff: null, pending: [], heard: [], sideLocked: "", failed: false, reread: false,
  };
  const saving = { teamId, visit, memory, draw: () => drawVisit(teamId, visit, memory) };
  const read = async () => {
    const ticket = ++visit.reads;
    const since = visit.heard.length;
    const answer = await readRoster(teamId);
    if (!visit.here || ticket !== visit.reads) return;
    Object.assign(visit, { answered: ticket, loading: false, error: answer.error ?? "" });
    if (!answer.error) holdTeam(saving, answer, trackRoster(answer.team), since);
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

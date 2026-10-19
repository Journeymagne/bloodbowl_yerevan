/**
 * The team's roster (`#/t/:id/roster`, plan 3.0, 7a): the table, a player's row that opens on a phone and the
 * panel beside it on a desk, the skills and their rules. What a line says is model.mjs's, the markup
 * view/panel/sheets', the writes save/taps'; this file reads, draws and lives as long as the visit. The player's
 * own address (`#/t/:id/roster/:playerId`) still draws the 2.x editor for a player of the roster until stage 07d, and
 * the roster leads there for what it does not do yet; a fallen player's is his profile (screens/team/player).
 *
 * Outside a match a counter's step is a save of the roster (save.mjs), drawn at once from the queue's draft. The
 * queue outlives the visit: what waits for the network is sent again on entry and when the network is back, and
 * never while a match is on (R8): a PATCH during a match breaks its finish (POST_TEAM_CHANGED), so a match that
 * begins while steps wait gives them up for the server's roster, and the coach is told how many SPP steps the server
 * does not have. A team is never taken on games older than it: the games are read once it has answered, and the
 * counters stay closed until both have.
 *
 * During a match a step is a row the server adds (match-taps.mjs, taps.mjs): a record of the match, or with «Edit
 * outside the match» an edit of the career that waits for the match's finish (Task 11). The counters wait while the
 * records are read: in a match, and after one ends, what they hold is not known until the read answers. A match that
 * ends while the screen is open, as the games say it, reads the roster and the records again.
 *
 * On a desk stage 08's treasury strip stands over the table (strip.mjs). Its writes land in the coach's list, and the
 * roster reads the team again when the list moves past the revision its queue saves on (`followList`).
 *
 * The team's fallen are read with it, every time (stage 07b, `readSnapshot`): they are drawn under the roster, and a
 * read of one without the other would draw a player twice or not at all. A missed match and back on the roster are
 * steps of the queue like a counter's (marks.mjs): a match that begins while one waits gives it up as it gives up
 * the SPP steps, and the coach is told how many of each. A death and its undo are no step of it: each goes only when
 * none waits, every step and mark waits while one is on its way, and its answer is the list's — and the queue's while
 * the visit that sent it is here (I1).
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
import { markEdits } from "../../../domain/roster/absence.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { readSnapshot } from "./data.mjs";
import { fallenWriting } from "./fallen.mjs";
import { rosterMemory, sessionSppOf } from "./memory.mjs";
import { fallenLines, nextSort, rosterLines, rosterMode, sortLines, stepRule } from "./model.mjs";
import { onSaveState, retrySaves, saveState, savedRevision, stepSpp, takeAnswerTeam, takeServerTeam, trackRoster } from "./save.mjs";
import { focusPlace, restoreFocus } from "./focus.mjs";
import { closeSheet, injuryHandlers, sheetOf } from "./injury.mjs";
import { recordsOf, sendRow, whenQuiet, withHeard } from "./match-taps.mjs";
import { markHandlers, markSheetOf } from "./marks.mjs";
import { sheetIdOf } from "./sheets.mjs";
import { listAhead, wireStrip } from "./strip.mjs";
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
 * @property {object[]} fallen the team's fallen as last read with it (GET …/fallen's records), none before the first answer
 * @property {object[]} pending the taps on their way, as the rows they would be (`{pairingId, playerId, counter, delta}`):
 *   the lines count them at once (Review Focus 1), and each answer takes its own out
 * @property {object[]} heard the rows the answers to taps have brought, in order: a read made before one was written keeps it
 * @property {string} sideLocked the server's words for `EVENT_SIDE_LOCKED`, which close the match's own taps until the records are read again
 * @property {boolean} failed a tap of the taps on their way has failed: its words are said, and those of the taps dropped behind it are not
 * @property {boolean} reread the records are read again once the taps on their way have answered
 * @property {boolean} unsure an injury's answer was lost: no injury is recorded until a read of the records is taken (R14)
 * @property {number} sent how many taps the visit has sent: a read during which one was sent is not taken
 * @property {(() => void)[]} quiet what waits for the taps on their way to have all answered (`whenQuiet`)
 * @property {string|null} match the game id of the match on as the games last said it, null for none
 * @property {boolean} stale the roster drawn was read during a match that is no longer on, or before a write of the
 *   treasury strip: no counter takes a step while the read that replaces it is in the air
 * @property {number|null} followed the revision of the coach's list the visit last read the team again for (`followList`)
 * @property {object|null} sheet the sheet that is open: a skill's `{kind, key, name}`, an injury's `{kind, key, choice}`, a
 *   mark's — a missed match or a death — `{kind, key, choice, busy, refusal}`, a death's undo `{kind, key, busy, refusal}` (marks.mjs)
 * @property {Element|null} opener the chip or the button that opened it
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

/** A read of the visit is in the air. */
const reading = (visit) => visit.answered !== visit.reads;

/**
 * Why no counter takes a step just now, "" when none: the games unread or unreadable, or to be read after the roster
 * in the air (`readWithGames`); the records read during a match or after one ended (fix round 1: a read may land with
 * a tap already in it, and a roster read during the match is no roster to save); a death on its way (K7: a step taken
 * now would go on the revision it moves, and its answer would give that step up); another device's save to settle.
 */
function lockOf(teamId, save, visit, mode) {
  if (!state.games.loaded || state.games.loading) return t("teamRoster.gamesLoading");
  if (state.games.error) return state.games.error;
  if (reading(visit)) return t(mode.kind === "match" || visit.stale ? "teamRoster.readingRecords" : "teamRoster.gamesLoading");
  if (fallenWriting(teamId)) return t("teamRoster.mark.writing");
  return save.status === SAVE_STATUS.CONFLICT ? t("teamRoster.conflict.title") : "";
}

/** An injury's answer was lost and no read is in the air: the one that followed failed (R14, fix round 1). */
const unsureOf = (visit) => visit.unsure && !reading(visit);

/** «Edit outside the match» is on for the match on: the switch is the team's and that match's (R13). */
const outsideOf = (memory, mode) => mode.kind === "match" && memory.outside === mode.game.id;

/**
 * The race of the visit's team, and its lines in the roster's own order for `mode`: what the queue's draft, the
 * records and the taps on their way say, and nothing more; then the fallen the roster drawn does not hold, in the
 * server's order (decision 21: a player is drawn once, on the roster, when a read caught him on both).
 */
function linesOf(visit, mode) {
  const race = visit.team ? raceTeamOf(visit.team.baseTeamSlug) : null;
  const draft = normalizeDraft(visit.draft ?? visit.team?.roster ?? {});
  const lines = race ? rosterLines({ draft, race, events: [...visit.events, ...visit.pending], mode }) : [];
  return { race, lines, fallen: fallenLines({ fallen: visit.fallen, race, rosterIds: lines.map(({ id }) => id) }) };
}

/** The kinds of sheet that are marks.mjs's to keep or close: a missed match's, a death's undo. */
const MARKS = ["mark", "undo"];

/** @returns {import("./view.mjs").RosterScreen} */
function screenOf(teamId, visit, memory) {
  const mode = modeOf(teamId);
  const outside = outsideOf(memory, mode);
  const { race, lines: own, fallen: dead } = linesOf(visit, mode);
  const lines = sortLines(own, memory.sort).map((line) => ({ ...line, sessionSpp: sessionSppOf(memory, line), sessionOutside: sessionSppOf(memory, line, { outside: true }) }));
  const fallen = sortLines(dead, memory.sort);
  const save = saveState(teamId);
  const where = { mode, outside, lock: lockOf(teamId, save, visit, mode), sideLocked: visit.sideLocked, unsure: unsureOf(visit), save };
  // A sheet whose player has left the screen (read again) closes with him; an injury's, with its match (injury.mjs); a
  // mark's, with a match begun or the mark taken (marks.mjs). A fallen player's chip opens a skill's sheet too.
  const sheet = (MARKS.includes(visit.sheet?.kind) ? markSheetOf : sheetOf)(visit, [...lines, ...fallen], where);
  if (!sheet) Object.assign(visit, { sheet: null, opener: null });
  return {
    team: visit.team, race, data: state.data, lines, fallen, memory, sheet, error: visit.error, loading: visit.loading, phone: isPhone(),
    ...where, records: recordsOf(visit, mode),
  };
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
 * away, and one made after has it once. A read of the records ends what `EVENT_SIDE_LOCKED` said. The fallen are the
 * read's, or the visit's own where the team comes without them.
 */
function holdTeam(saving, { team, events, fallen }, draft, since) {
  const { visit } = saving;
  Object.assign(visit, { team, events: withHeard(visit, events, since), fallen: fallen ?? visit.fallen, draft, sideLocked: "", stale: false, unsure: false });
  visit.saveOff?.();
  visit.saveOff = onSaveState(team.id, (now) => heardSave(saving, now));
}

/**
 * The one read of the team, its records and its fallen (`readSnapshot`), then of the games (Carry T10), that every
 * taking of a team goes through: a team is never taken on games older than it — read side by side, the games could
 * answer before a match's start and the team after it (final review, Minor 1). The answer is taken only when it is
 * the visit's last read and no tap was in the air while it was made (fix round 2, N1): such a read may hold the tap's
 * row or not, in the records or, after a finish, in the roster — so it is made again once the taps have answered, the
 * counters closed meanwhile, and its caller takes the read that replaces it (N3). A read that fails says why, and
 * opens them.
 * @param {Saving} saving
 * @returns {Promise<{answer: {team: object, events: object[], fallen: object[]}, since: number}|null>} null when there is nothing to take
 */
async function readWithGames(saving) {
  const { teamId, visit, draw } = saving;
  const ticket = ++visit.reads;
  const current = () => visit.here && ticket === visit.reads;
  for (;;) {
    const [since, sent, quiet] = [visit.heard.length, visit.sent, !visit.pending.length];
    const answer = await readSnapshot(teamId);
    if (!current()) return null;
    await loadGames(true);
    if (!current()) return null;
    if (quiet && !visit.pending.length && visit.sent === sent) {
      visit.answered = ticket;
      if (!answer.error) return { answer, since };
      toast(answer.error, { tone: "error" });
      draw();
      return null;
    }
    await whenQuiet(visit);
    if (!current()) return null;
  }
}

/**
 * Read the team and its records again and take the server's roster in place of the coach's: after another device's
 * save, a refused one, or steps a match has made impossible (`readWithGames`: a 409 is often how a coach learns that a
 * match has begun, and a team read after its start, drawn on the games from before it, would let the next tap save
 * the roster during the match, R8). Not while a request is in the air (`takeServerTeam` says null): the state the
 * queue comes to next asks again (Carry T7 d).
 *
 * In a match the coach is told how many SPP steps of his the server does not have (a step whose answer was lost
 * may have landed: it is not one of them), never more than waited: another device's SPP change is not his; and, in
 * words of their own, how many missed-match marks (stage 07b, decision 8), never more than waited besides those.
 * After another device's save his SPP are counted afresh; after a refusal or a match the server holds his saved
 * steps as they were, and they still count.
 * @param {Saving} saving
 */
async function reloadRoster(saving) {
  const { teamId, visit, memory, draw } = saving;
  const read = await readWithGames(saving);
  if (!read) return;
  const { answer, since } = read;
  const { status, waiting } = saveState(teamId);
  const spp = Math.min(sppEdits(answer.team.roster, visit.draft).length, waiting);
  const marks = Math.min(markEdits(answer.team.roster, visit.draft), waiting - spp);
  const conflict = status === SAVE_STATUS.CONFLICT;
  const draft = takeServerTeam(answer.team);
  visit.retake = !draft;
  if (draft) {
    if (conflict) memory.baseline.clear();
    holdTeam(saving, answer, draft, since);
  }
  draw();
  if (!draft || modeOf(teamId).kind !== "match") return;
  if (spp) toast(t("teamRoster.matchDropped", { count: spp }), { tone: "error" });
  if (marks) toast(t("teamRoster.mark.matchDropped", { count: marks }), { tone: "error" });
}

/**
 * The team and its records read again (`readWithGames`) after a tap whose fate is not known, a minus that found
 * nothing to take back, a match that is no longer on, a death or an undo whose answer was lost. The team is taken as a
 * read takes it (`trackRoster`): a step of the roster's queue that waits keeps its draft, and during a match none leaves (R8).
 * @param {Saving} saving
 * @returns {Promise<boolean>} whether a read was taken: none when it failed, or the visit or a later read has it
 */
async function readAgain(saving) {
  const read = await readWithGames(saving);
  if (!read) return false;
  holdTeam(saving, read.answer, trackRoster(read.answer.team), read.since);
  saving.draw();
  settleWaiting(saving, { retry: false });
  return true;
}

/**
 * The server's roster in place of the queue's (`reloadRoster`), only while no step of the coach's waits or is in the
 * air: outside a match taking it would give such a step up without a word (K7). The step meets the server's revision
 * instead, as the conflict the coach settles.
 * @param {Saving} saving
 */
async function reloadFree(saving) {
  const { status, waiting } = saveState(saving.teamId);
  if (!waiting && !busy(status)) await reloadRoster(saving);
}

/**
 * The team a death or its undo was answered with, and the fallen to draw (marks.mjs, K5): the list's whatever became of
 * the visit (K8), and the queue's while the visit is here (`takeAnswerTeam`, I1) — drawn then. Once it has left, the
 * queue is another visit's: that one reads the team again when the list is ahead of it (`followList`). A team the queue
 * does not take — older than what it holds, or met by a step that waits — is not drawn: the roster is read again (`reloadFree`).
 * @param {Saving} saving @param {{team: object, fallen: object[]}} answer
 */
function holdAnswer(saving, { team, fallen }) {
  const { visit } = saving;
  const draft = takeAnswerTeam(team, { queue: visit.here });
  if (!visit.here) return;
  if (draft) holdTeam(saving, { team, events: visit.events, fallen }, draft, visit.heard.length);
  else void reloadFree(saving);
  saving.draw();
}

/**
 * The games say another match than the one on when they were last heard, or none any more: the match ended
 * elsewhere (its finish wrote the roster and settled the records) or another began (Carry T10). The roster and the
 * records are read again with the games, and no counter takes a step until they answer (`stale`). A read already in
 * the air answers for it — most often it is that read's own games that say so (`MATCH_NOT_LIVE`); one sent before
 * the finish would leave a save to meet the server's 409, not to overwrite it.
 * @param {Saving} saving
 */
function followMatch(saving) {
  const { teamId, visit } = saving;
  const mode = modeOf(teamId);
  const now = mode.kind === "match" ? mode.game.id : null;
  const was = visit.match;
  visit.match = now;
  if (!was || was === now) return;
  visit.stale = true;
  if (!reading(visit)) void readAgain(saving);
}

/**
 * What the rows of a match are sent with (match-taps.mjs): the visit, and its read of the records once they have
 * answered — a read already in the air was made while they were: it is made again then, and stands for this one.
 * @param {Saving} saving
 * @returns {import("./match-taps.mjs").Tapping}
 */
function tappingOf(saving) {
  return {
    ...saving,
    readAgain: () => {
      if (!reading(saving.visit)) void readAgain(saving);
    },
  };
}

/**
 * Where a step goes (`stepRule`): outside a match it is a save of the roster (Task 10); in a match a row, a record of
 * it or with «Edit outside the match» an edit of the career, never a save of the roster (R8; match-taps.mjs).
 * @param {Saving} saving
 */
function takeStep(saving, line, counter, delta, mode) {
  const { teamId, memory } = saving;
  const { via } = stepRule(line, counter, { mode, outside: outsideOf(memory, mode) });
  if (via !== "roster") {
    void sendRow(tappingOf(saving), { pairingId: via === "match" ? mode.game.id : null, playerId: line.id, counter, delta });
    return;
  }
  const { refusal } = stepSpp(teamId, line.id, counter, delta);
  if (!refusal) return;
  toast(refusal, { tone: "error" });
  retakeRefused(saving);
}

/**
 * A step refused while the queue waits for the server's roster after a 422 (save.mjs) — a counter's, a mark's: a read
 * that failed left the screen with no way forward, so the press asks for that roster again (07a, c088324).
 * @param {Saving} saving
 */
function retakeRefused(saving) {
  const save = saveState(saving.teamId);
  if (save.status === SAVE_STATUS.ERROR && save.kind === API_ERROR.INVALID && !reading(saving.visit)) void reloadRoster(saving);
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
 * A write elsewhere on the page — the treasury strip's (stage 08), which lands in the coach's list — has moved the team
 * past the revision the queue saves on (`listAhead`): the next step, sent on the one before, would meet a 409 and lay
 * the roster as read over the entry. The team and its records are read again (`readAgain`), the counters closed until
 * they answer, so that step goes on the new revision with the new roster (K4 b).
 *
 * Only when no step waits and none is in the air, and no read is: a step that waits keeps its draft and meets the new
 * revision as the conflict the coach settles; the queue's own saves put their answer in the list and in the queue
 * alike, so they never ask. Heard on every change of the list and of the queue, so a write heard while a request or
 * a read was in the air is followed once it has answered; each revision of the list once, so a read that fails is
 * not made again for it.
 * @param {Saving} saving
 */
function followList(saving) {
  const { teamId, visit } = saving;
  const { status, waiting } = saveState(teamId);
  if (!visit.here || !visit.team || reading(visit) || waiting || busy(status)) return;
  const ahead = listAhead(teamId, savedRevision(teamId));
  if (ahead === null || ahead === visit.followed) return;
  Object.assign(visit, { followed: ahead, stale: true });
  // Drawn once the read is sent, so that the counters say they wait for it: the games, read after the roster, draw nothing before then.
  void readAgain(saving);
  saving.draw();
}

/**
 * Every change of the queue's state: drawn at once; a refusal said, a 422 taking the server's roster (the steps break
 * the rules as the server reads them); a take that had to wait asked again unless a save has since landed; a fresh
 * conflict reading the games, since it is often a match's start, which the games then settle R8's way (final review,
 * Minor 3: `onGamesChange` → `settleWaiting`); the steps that wait settled; a write of the strip heard meanwhile followed.
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
    else if (before && before !== SAVE_STATUS.CONFLICT && now.status === SAVE_STATUS.CONFLICT) void loadGames(true);
    settleWaiting(saving, { retry: false });
    followList(saving);
  } catch (error) {
    // A listener of the queue that throws would leave its request in the air for good (roster-store's notify).
    console.error(error);
  }
}

/**
 * What a press does: a header sorts, a player's button opens his row (a phone) or chooses him for the panel (a desk),
 * a chip opens its skill's sheet and the sheet's close gives the focus back to it, «Try again» reads again; a
 * counter's step saves the roster or adds a row (`takeStep`), a refused one says why, «Load the new one» takes the
 * server's, the switch makes the match's taps edits outside it and back; «Injury in the match…» and its sheet are
 * injury.mjs's, their rows the match's taps (R14); «Miss a match…», its sheet and «Back on the roster» are marks.mjs's.
 * @param {Saving & {read: Function}} handlers the visit's side of the queue (`draw` draws it again), and `read`, which reads the roster again
 */
function pressHandlers({ read, ...saving }) {
  const { teamId, memory, visit, draw } = saving;
  const now = () => {
    const mode = modeOf(teamId);
    const save = saveState(teamId);
    const { lines, fallen } = linesOf(visit, mode);
    return { mode, outside: outsideOf(memory, mode), lines, fallen, lock: lockOf(teamId, save, visit, mode), save, sideLocked: visit.sideLocked, unsure: unsureOf(visit) };
  };
  const marks = {
    now, refused: () => retakeRefused(saving), hold: (answer) => holdAnswer(saving, answer),
    readAgain: () => readAgain(saving), reload: () => reloadFree(saving),
  };
  return {
    ...injuryHandlers(saving, { tapping: tappingOf(saving), now }),
    ...markHandlers(saving, marks),
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
      if (visit.sheet && id === sheetIdOf(visit.sheet.kind)) closeSheet(saving);
    },
    // The games are read after the team, so that it is not taken on games older than it (R8; `read`).
    onRetry: () => {
      Object.assign(visit, { loading: true, error: "" });
      draw();
      return read();
    },
    // The lock is asked again: the games may have begun to be read since the counter was drawn.
    onStep: (playerId, counter, delta) => {
      const mode = modeOf(teamId);
      const lock = lockOf(teamId, saveState(teamId), visit, mode);
      const line = linesOf(visit, mode).lines.find((item) => item.id && item.id === playerId);
      if (lock) toast(lock);
      else if (line) takeStep(saving, line, counter, delta, mode);
    },
    onRefused: (reason) => toast(reason),
    onReload: () => void reloadRoster(saving),
    // An injury whose fate is not known, after a read that failed: «Try again» reads the records (R14).
    onReread: () => {
      if (!reading(visit)) void readAgain(saving);
    },
    // Kept for the team and the match on while the page lives (memory.mjs, R13): a visit elsewhere and back finds it as it was.
    onOutside: (on) => {
      const mode = modeOf(teamId);
      memory.outside = on && mode.kind === "match" ? mode.game.id : null;
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
    patchWithModal(view, markup, visit.sheet ? `#${sheetIdOf(visit.sheet.kind)}` : "");
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
    here: true, drawn: false, loading: true, error: "", team: null, draft: null, events: [], fallen: [], sheet: null, opener: null,
    reads: 0, answered: 0, status: "", retake: false, saveOff: null, pending: [], heard: [], sideLocked: "", failed: false, reread: false,
    match: null, stale: false, sent: 0, quiet: [], unsure: false, followed: null,
  };
  const saving = { teamId, visit, memory, draw: () => drawVisit(teamId, visit, memory) };
  // The team and its fallen, then the games (R8): asked for before the team is drawn, so that its counters are drawn closed until they answer.
  const read = async () => {
    const ticket = ++visit.reads;
    const since = visit.heard.length;
    const answer = await readSnapshot(teamId);
    if (!visit.here || ticket !== visit.reads) return;
    const games = loadGames(true);
    Object.assign(visit, { answered: ticket, loading: false, error: answer.error ?? "" });
    if (!answer.error) holdTeam(saving, answer, trackRoster(answer.team), since);
    saving.draw();
    await games;
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
      followMatch(saving);
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
  wireStrip(view, () => followList(saving));
  saving.draw();
  await read();
  // The steps an earlier visit left waiting go now, if no match is on: an `online` may never come (R8).
  settleWaiting(saving, { retry: true });
}

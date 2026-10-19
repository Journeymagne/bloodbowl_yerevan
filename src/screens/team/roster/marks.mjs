/**
 * The roster's marks (stage 07b): a missed match and back on the roster, which are steps of the save queue (save.mjs)
 * and are drawn at once from its draft; a death and its undo (fallen.mjs), which are not, and go only when the queue
 * has nothing waiting. None of them during a match (R8): their place is the match's injury. What a sheet holds lives
 * on the visit, as the injury's sheet does (injury.mjs).
 *
 * A mark is a step like a tap on a counter: it waits for the network with them, a lost answer is known by the 409
 * that holds it, another device's save is the coach's to settle, and a match that begins while it waits gives it up
 * with the coach told how many (index.mjs, `reloadRoster`). A player who misses the next match is offered no second
 * mark — it would lay its injury over the first — but «Back on the roster», then a mark (owner's question 4).
 *
 * A death (Task 8) is one write of stage 03's, on the revision the queue stands on: never while a step of the queue
 * waits, is on its way, or meets a conflict or a 422 (its button says so, K6), and every step and mark waits for its
 * answer (index.mjs's lock, K7). That answer is the list's however the sheet has fared (K8) — and the queue's while the
 * visit that sent it is here (I1) — and only for the coach who sent it; a lost one is never sent again: the roster and
 * the fallen are read back, and the coach is told what they say — and only what both say (K15). Its undo (Task 9),
 * asked first in a sheet of its own, is written the same way (`writeOnce`, `readBack`): it names its record and no
 * revision, so it meets no conflict, and a record the server no longer has reads the roster again, the coach told what
 * the read shows. The player's own page (screens/team/player, Task 10) offers the same undo through `markHandlers`,
 * with a `Lent` of its own.
 */
import { toast } from "../../../components/toast.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { storedPlayerId } from "../../../domain/roster/players.mjs";
import { fallenWriting, markDeath, undoDeath } from "./fallen.mjs";
import { closeSheet, keyed } from "./injury.mjs";
import { chosenMark } from "./mark-sheet.mjs";
import { undoable } from "./model.mjs";
import { markClosed, returnClosed } from "./panel.mjs";
import { markSkip, savedRevision, unmarkSkip } from "./save.mjs";

/**
 * The screen as it stands at a press, as far as a mark goes: the mode, why every write is closed just now, the save
 * queue's state, and the lines — the roster's and the fallen.
 * @typedef {{mode: object, lock: string, save: {status: string, waiting: number}, lines: import("./model.mjs").PlayerLine[],
 *   fallen: import("./model.mjs").FallenLine[]}} Now
 */

/** The player of `key` on the roster as it stands, or null: the sheet's, a row's. */
const lineOf = (where, key) => where.lines.find((line) => line.key === key) ?? null;

/** The fallen player of `key` while his death is one the screen undoes (`undoable`), or null: the undo's sheet's, the panel's. */
const undoneOf = (where, key) => where.fallen.find((line) => line.key === key && undoable(line)) ?? null;

/**
 * What the screen lends the marks (index.mjs).
 * @typedef {object} Lent
 * @property {() => Now} now the screen as it stands at a press
 * @property {() => void} refused the server's roster asked again, after a refusal of the queue's 422 whose read failed
 * @property {(answer: {team: object, fallen: object[]}) => void} hold a death's or an undo's answer taken: its team, and the fallen to draw (K5)
 * @property {function(): Promise<boolean>} readAgain the roster and the fallen read again; true when the read was taken
 * @property {function(): Promise<void>} [reload] the server's roster in place of the queue's, while no step waits or is on its
 *   way: a death's conflict asks for it, so only a page that marks deaths (the roster) lends it
 * @property {(line: import("./model.mjs").FallenLine, mine: boolean) => void} [back] what a page that draws no roster (the
 *   player's own, screens/team/player) does once he is back, in place of his row and the message (`backSaid`)
 */

/**
 * The sheet as the screen draws it, or null when it stands no longer: a mark's while its player is on the roster, plays
 * the next match and no match is on; an undo's while his death is among the fallen and the screen undoes it — open
 * in a match too, saying why it waits. Each says why nothing can be sent just now (`markClosed`) — for a death and its
 * undo, a step of the queue that waits too (K6).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where & {save: {status: string, waiting: number}}} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function markSheetOf(visit, lines, where) {
  const { sheet } = visit;
  if (sheet?.kind === "undo") {
    const fallen = lines.find((item) => item.key === sheet.key && undoable(item));
    return fallen ? { ...sheet, reason: markClosed(fallen, where, { direct: true }) } : null;
  }
  const line = sheet?.kind === "mark" ? lines.find((item) => item.key === sheet.key && !item.fallen) : null;
  if (!line || line.skip || where.mode.kind === "match") return null;
  return { ...sheet, reason: markClosed(line, where, { direct: sheet.choice.code === "dead" }) };
}

/**
 * «Mark the missed match»: the choice made whole and the closure asked again, then one step of the queue. A refusal
 * (another tab's coach, the rules a 422 left the queue waiting on) is said in the sheet, which stays as it was; a
 * step taken closes it, and the focus goes to his row's button — in «Missing the match» now, under the same key — and
 * the panel keeps him. A step not taken (he misses the match already, the conflict the screen's lock says) changes
 * nothing but the drawing, which closes a sheet that no longer stands. A refusal while the queue waits for the server's
 * roster after a 422 asks for it again (`refused`), as a counter's step does: else a read that failed would leave
 * every press to say the same rule and nothing more (07a, c088324).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => Now, refused: () => void}} options
 */
function sendMark({ teamId, visit, memory, draw }, { now, refused }) {
  const { sheet } = visit;
  if (sheet?.kind !== "mark" || sheet.busy) return;
  const where = now();
  const line = lineOf(where, sheet.key);
  const reason = line ? markClosed(line, where) : "";
  const mark = chosenMark(sheet.choice);
  if (reason) toast(reason);
  if (reason || !mark) return;
  const answer = line && !line.skip ? markSkip(teamId, line.id, mark) : { ok: false };
  if (answer.refusal) sheet.refusal = answer.refusal;
  else if (answer.ok) {
    Object.assign(visit, { sheet: null, opener: null });
    memory.selected = sheet.key;
  }
  draw();
  if (answer.ok) keyed("data-row-key", sheet.key)?.focus();
  if (answer.refusal) refused();
}

/**
 * What a read says of a write of the fallen (K15): `landed` where the fallen and the roster agree it was written — for
 * a death his record is there and he is gone from the roster, for an undo the record is gone and he is back — `none`
 * where both say it was not, `split` where the read caught the write half done (the two are read side by side).
 * @param {{fallen: object[]}} visit
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's
 * @param {{recorded: (record: object) => boolean, playerId: string, death: boolean}} write the record it is known by, the
 *   player, and whether it was a death (else an undo)
 * @returns {"landed"|"none"|"split"}
 */
function writeRead(visit, lines, { recorded, playerId, death }) {
  const kept = visit.fallen.some(recorded);
  if (kept === lines.some((line) => line.id === playerId)) return "split";
  return kept === death ? "landed" : "none";
}

/**
 * A write of the fallen whose answer was lost: never sent again. The roster and the fallen are read back, and the coach
 * is told what they hold (`landed`, or the words of `none`); a read that caught the write half done is made once more,
 * and if it too is split, or a read fails, the coach is told the server could not be told (`unknown`, K15). Nothing is
 * said once the visit is over.
 * @param {import("./index.mjs").Saving} saving
 * @param {Lent} lent
 * @param {{write: Parameters<typeof writeRead>[2], landed: () => void, none: string, unknown: string}} told
 */
async function readBack({ visit }, { now, readAgain }, { write, landed, none, unknown }) {
  for (let read = 0; read < 2; read += 1) {
    if (!(await readAgain())) break;
    const verdict = writeRead(visit, now().lines, write);
    if (verdict === "landed") {
      landed();
      return;
    }
    if (verdict === "none") {
      toast(none, { tone: "error" });
      return;
    }
  }
  if (visit.here) toast(unknown, { tone: "error" });
}

/**
 * He fell, as the server says: the coach is told; and when the sheet that sent it was still open, the panel takes his
 * record and the focus his row in «Fallen». What is said is said once the screen is drawn (the function it returns).
 */
function fallenSaid({ memory }, { fallenId, name, mine }) {
  const key = `fallen-${fallenId}`;
  if (mine) memory.selected = key;
  return () => {
    if (mine) keyed("data-row-key", key)?.focus();
    toast(t("teamRoster.mark.deadDone", { name }));
  };
}

/** A death whose answer was lost, read back (`readBack`): his record among the fallen, and he gone from the roster. */
function deathLost(saving, lent, { line, mine }) {
  const recorded = (record) => storedPlayerId(record.player) === line.id;
  const landed = () => {
    const said = fallenSaid(saving, { fallenId: saving.visit.fallen.find(recorded).id, name: line.name, mine });
    saving.draw();
    said();
  };
  return readBack(saving, lent, {
    write: { recorded, playerId: line.id, death: true }, landed, none: t("teamRoster.mark.deadLost"), unknown: t("teamRoster.fallen.unknown"),
  });
}

/**
 * A refusal of a write of the fallen: said in the sheet that sent it, which stays as it was and no longer waits; closed
 * meanwhile, in a message while the roster is on the coach's screen — in `closed`, words that ask for no press where no
 * sheet is left to press in (R2).
 */
function refusalSaid({ visit, draw }, { sheet, mine }, refusal, closed = refusal) {
  if (mine) Object.assign(sheet, { refusal, busy: false });
  else if (visit.here) toast(closed, { tone: "error" });
  draw();
}

/**
 * A death's answer, heard by the coach who sent it. The team it brings is always taken, whatever became of the sheet
 * (K8), with his record first among the fallen (K5). The sheet, while it is still the one that sent it, closes and
 * gives the focus, or says why not; closed meanwhile, the coach is told in a message while the roster is on his screen.
 * Another device's save reads the roster again; a lost answer reads it back (`deathLost`); a player the server no
 * longer has is read again too — a read that takes him away takes the sheet with him, and its words go on in a message
 * (M1); any other refusal is only said.
 */
async function heardDeath(saving, lent, { sheet, line, answer }) {
  const { visit } = saving;
  const mine = visit.here && visit.sheet === sheet;
  if (answer.team) {
    const said = visit.here ? fallenSaid(saving, { fallenId: answer.fallen.id, name: line.name, mine }) : null;
    if (mine) Object.assign(visit, { sheet: null, opener: null });
    lent.hold({ team: answer.team, fallen: [answer.fallen, ...visit.fallen.filter((record) => record.id !== answer.fallen.id)] });
    said?.();
    return;
  }
  if (answer.lost) {
    // The read is sent first, so that the screen the sheet closes on has every step closed until it answers.
    const read = deathLost(saving, lent, { line, mine });
    if (mine) closeSheet(saving);
    await read;
    return;
  }
  const conflict = "conflict" in answer;
  const again = conflict ? lent.reload() : answer.code === "PLAYER_NOT_FOUND" ? lent.readAgain() : null;
  const [refusal, closed] = conflict ? [t("teamRoster.mark.changed"), t("teamRoster.mark.changedClosed")] : [answer.refusal, answer.refusal];
  refusalSaid(saving, { sheet, mine }, refusal, closed);
  if (!again) return;
  await again;
  if (mine && visit.here && visit.sheet !== sheet) toast(closed, { tone: "error" });
}

/**
 * One write of the fallen from the sheet of `kind` that is open, a death's or an undo's: the closure asked again, a
 * step of the queue that waits included (K6; after a 422 whose read failed the server's roster is asked for again,
 * `refused`); nothing while a write of the fallen is on its way, nor while the sheet is not whole (`send` says null);
 * then the one request `send` makes, the sheet busy with it. Its answer is `heard` only for the coach who sent it (T4
 * review's carry): another coach signed in since has nothing of it.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {Lent} lent
 * @param {object} write
 * @param {string} write.kind the sheet's
 * @param {(where: Now, key: string) => object|null} write.find the player of the sheet, as the screen stands
 * @param {function(object, object): (function(): Promise<object>)|null} write.send the request for the player and the sheet,
 *   or null where there is none to make
 * @param {function(object, Lent, {sheet: object, line: object, answer: object}): Promise<void>} write.heard what its answer does
 */
async function writeOnce(saving, lent, { kind, find, send, heard }) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== kind || sheet.busy) return;
  const where = lent.now();
  const line = find(where, sheet.key);
  const reason = line ? markClosed(line, where, { direct: true }) : "";
  if (reason) {
    toast(reason);
    lent.refused();
  }
  const request = reason || !line || fallenWriting(teamId) ? null : send(line, sheet);
  if (!request) return;
  const coach = state.auth.currentUser?.id;
  sheet.busy = true;
  const sent = request();
  // Drawn once it is sent, so that every step and mark is drawn waiting for it (index.mjs's lock).
  draw();
  const answer = await sent;
  if (answer.ignored || state.auth.currentUser?.id !== coach) {
    sheet.busy = false;
    draw();
    return;
  }
  await heard(saving, lent, { sheet, line, answer });
}

/** «Mark the death» (`writeOnce`): one `POST …/death` with the cause, on the revision the queue stands on. */
function sendDeath(saving, lent) {
  const { teamId } = saving;
  const send = (line, sheet) => {
    const death = chosenMark(sheet.choice);
    return death?.code === "dead" ? () => markDeath(teamId, line.id, { cause: death.cause, revision: savedRevision(teamId) }) : null;
  };
  return writeOnce(saving, lent, { kind: "mark", find: lineOf, send, heard: heardDeath });
}

/**
 * He is back on the roster, as the server says: the coach is told; and when the sheet that sent it was still open, the
 * panel takes him — his line on the roster drawn now, by his id — and the focus his row. The player's own page tells it
 * its own way (`lent.back`): it has no row to give the focus to, and its page says it.
 */
function backSaid({ memory, draw }, { now, back: told }, { line, mine }) {
  if (told) {
    told(line, mine);
    return;
  }
  const back = mine ? now().lines.find((item) => item.id === line.id) : null;
  if (back) {
    memory.selected = back.key;
    draw();
    keyed("data-row-key", back.key)?.focus();
  }
  toast(t("teamRoster.fallen.back", { name: line.name }));
}

/** An undo as a read tells it (`writeRead`): his record, and he on the roster. */
const undoneWrite = (line) => ({ recorded: (record) => record.id === line.fallen.id, playerId: line.id, death: false });

/** An undo whose answer was lost, read back (`readBack`): his record gone from the fallen, and he back on the roster. */
function undoLost(saving, lent, { line, mine }) {
  return readBack(saving, lent, {
    write: undoneWrite(line),
    landed: () => backSaid(saving, lent, { line, mine }),
    none: t("teamRoster.fallen.undoLost"),
    unknown: t("teamRoster.fallen.undoUnknown"),
  });
}

/**
 * An undo of a record the server no longer has (another device undid it, most often): the roster and the fallen are read
 * again before a word is said, and the coach is told what the read shows (T10, R2) — that he is back, as for an undo of
 * the coach's own (`backSaid`), else the server's words: in the sheet while it stands, in a message once the read has
 * taken it. Never «not found» over a screen that shows him back.
 */
async function undoGone(saving, lent, { sheet, line, mine }, refusal) {
  const { visit } = saving;
  const read = await lent.readAgain();
  if (read && writeRead(visit, lent.now().lines, undoneWrite(line)) === "landed") backSaid(saving, lent, { line, mine });
  else refusalSaid(saving, { sheet, mine: visit.here && visit.sheet === sheet }, refusal);
}

/**
 * An undo's answer, heard by the coach who sent it. The team it brings is always taken, whatever became of the sheet
 * (K8), his record gone from the fallen; the sheet, while it is still the one that sent it, closes and the panel and the
 * focus take him back on the roster; else the coach is told in a message. A lost answer reads the roster back
 * (`undoLost`); a record the server no longer has reads it again (`undoGone`). Any other refusal is said in the sheet.
 */
async function heardUndo(saving, lent, { sheet, line, answer }) {
  const { visit } = saving;
  const mine = visit.here && visit.sheet === sheet;
  if (answer.team) {
    if (mine) Object.assign(visit, { sheet: null, opener: null });
    lent.hold({ team: answer.team, fallen: visit.fallen.filter((record) => record.id !== line.fallen.id) });
    if (visit.here) backSaid(saving, lent, { line, mine });
    return;
  }
  if (answer.lost) {
    // The read is sent first, so that the screen the sheet closes on has every step closed until it answers.
    const read = undoLost(saving, lent, { line, mine });
    if (mine) closeSheet(saving);
    await read;
    return;
  }
  if (answer.code === "FALLEN_NOT_FOUND") await undoGone(saving, lent, { sheet, line, mine }, answer.refusal);
  else refusalSaid(saving, { sheet, mine }, answer.refusal);
}

/** «Back on the roster» in the undo's sheet (`writeOnce`): one `DELETE …/fallen/:fid` of his record. */
function sendUndo(saving, lent) {
  return writeOnce(saving, lent, { kind: "undo", find: undoneOf, send: (line) => () => undoDeath(saving.teamId, line.fallen.id), heard: heardUndo });
}

/**
 * What the marks' presses do (wire.mjs): «Miss a match…» opens the sheet, a reason, its characteristic or its words
 * are kept in it, «Mark the missed match» takes the step (`sendMark`), «Back on the roster» takes its own. «Undo the
 * mark» opens its own sheet, which «Keep» closes, the focus back on the button, and whose «Back on the roster» sends the
 * undo (`sendUndo`). A press on one that is closed says why and does nothing.
 *
 * A sheet's `busy` is a write of it on its way: a missed match never is one (a step of the queue closes the sheet at
 * once), a death and an undo are (`sendDeath`, `sendUndo`). The sheet's button says so and keeps the focus, and a
 * press on it meanwhile is refused here (`writeOnce`).
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {Lent} lent what the screen lends: `now` is the screen as it stands at the press; `refused` is what a step the
 *   queue refused asks for: the server's roster again, when a 422's read of it failed (index.mjs); `hold`, `readAgain`
 *   and `reload` take a death's answer
 */
export function markHandlers(saving, lent) {
  const { now, refused } = lent;
  const { teamId, visit, draw } = saving;
  // The same sheet, changed: the field the coach types in survives the redraw (patchWithModal keeps its caret). A
  // refusal was said of the choice before, and goes with it. Not while its death is on its way: the sheet shows what
  // was sent, and the drawing puts back a card the press has turned.
  const change = (part) => {
    if (visit.sheet?.kind !== "mark") return;
    if (!visit.sheet.busy) Object.assign(visit.sheet, { choice: { ...visit.sheet.choice, ...part }, refusal: "" });
    draw();
  };
  return {
    onMark: (key, button) => {
      const where = now();
      const line = lineOf(where, key);
      if (!line || line.skip) return;
      const reason = markClosed(line, where);
      if (reason) toast(reason);
      else {
        Object.assign(visit, { sheet: { kind: "mark", key, choice: { code: "", stat: "", text: "" }, busy: false, refusal: "" }, opener: button });
        draw();
      }
    },
    onMarkChoice: (part) => change(part),
    onMarkText: (text) => change({ text }),
    onMarkSend: () => (visit.sheet?.choice?.code === "dead" ? void sendDeath(saving, lent) : sendMark(saving, { now, refused })),
    onReturn: (key) => {
      const where = now();
      const line = lineOf(where, key);
      if (!line?.skip) return;
      const reason = returnClosed(line, where);
      if (reason) {
        toast(reason);
        return;
      }
      const { refusal } = unmarkSkip(teamId, line.id);
      if (!refusal) return;
      toast(refusal, { tone: "error" });
      refused();
    },
    onUndo: (key, button) => {
      const where = now();
      const line = undoneOf(where, key);
      const reason = line ? markClosed(line, where, { direct: true }) : "";
      if (reason) toast(reason);
      else if (line) {
        Object.assign(visit, { sheet: { kind: "undo", key, busy: false, refusal: "" }, opener: button });
        draw();
      }
    },
    onUndoKeep: () => {
      if (visit.sheet?.kind === "undo") closeSheet(saving);
    },
    onUndoSend: () => void sendUndo(saving, lent),
  };
}

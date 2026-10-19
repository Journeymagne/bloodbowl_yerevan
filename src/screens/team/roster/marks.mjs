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
 * answer (index.mjs's lock, K7). That answer is the queue's and the list's however the sheet has fared (K8), and only
 * for the coach who sent it; a lost one is never sent again: the roster and the fallen are read back, and the coach is
 * told what they say — and only what both say (K15).
 */
import { toast } from "../../../components/toast.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { storedPlayerId } from "../../../domain/roster/players.mjs";
import { fallenWriting, markDeath } from "./fallen.mjs";
import { closeSheet, keyed } from "./injury.mjs";
import { chosenMark } from "./mark-sheet.mjs";
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

/**
 * What the screen lends the marks (index.mjs).
 * @typedef {object} Lent
 * @property {() => Now} now the screen as it stands at a press
 * @property {() => void} refused the server's roster asked again, after a refusal of the queue's 422 whose read failed
 * @property {(answer: {team: object, fallen: object[]}) => void} hold a death's answer taken: its team, and the fallen to draw (K5)
 * @property {function(): Promise<boolean>} readAgain the roster and the fallen read again; true when the read was taken
 * @property {function(): Promise<void>} reload the server's roster in place of the queue's, while no step waits or is on its way
 */

/**
 * The sheet as the screen draws it, or null when it stands no longer: a mark's while its player is on the roster, plays
 * the next match and no match is on. It says why no mark can be made just now (`markClosed`) — for a death, a step of
 * the queue that waits too (K6).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where & {save: {status: string, waiting: number}}} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function markSheetOf(visit, lines, where) {
  const { sheet } = visit;
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
 * What a read says of his death: his record among the fallen and he gone from the roster is a death (K15), neither is
 * none; one without the other is a read that caught the write half done.
 * @returns {"marked"|"none"|"split"}
 */
function deathRead(visit, lines, playerId) {
  const recorded = visit.fallen.some((record) => storedPlayerId(record.player) === playerId);
  const onRoster = lines.some((line) => line.id === playerId);
  if (recorded !== onRoster) return recorded ? "marked" : "none";
  return "split";
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

/**
 * A death whose answer was lost: never sent again. The roster and the fallen are read back, and the coach is told
 * what they hold; a read that caught the write half done is made once more, and if it too is split, or a read fails,
 * the coach is told the server could not be told (K15). Nothing is said once the visit is over.
 */
async function deathLost(saving, { now, readAgain }, { line, mine }) {
  const { visit, draw } = saving;
  for (let read = 0; read < 2; read += 1) {
    if (!(await readAgain())) break;
    const verdict = deathRead(visit, now().lines, line.id);
    if (verdict === "none") {
      toast(t("teamRoster.mark.deadLost"), { tone: "error" });
      return;
    }
    if (verdict === "marked") {
      const record = visit.fallen.find((item) => storedPlayerId(item.player) === line.id);
      const said = fallenSaid(saving, { fallenId: record.id, name: line.name, mine });
      draw();
      said();
      return;
    }
  }
  if (visit.here) toast(t("teamRoster.fallen.unknown"), { tone: "error" });
}

/**
 * A death's answer, heard by the coach who sent it. The team it brings is always taken, whatever became of the sheet
 * (K8), with his record first among the fallen (K5). The sheet, while it is still the one that sent it, closes and
 * gives the focus, or says why not; closed meanwhile, the coach is told in a message while the roster is on his screen.
 * Another device's save reads the roster again; a lost answer reads it back (`deathLost`); a player the server no
 * longer has is read again too; any other refusal is only said.
 */
async function heardDeath(saving, lent, { sheet, line, answer }) {
  const { visit, draw } = saving;
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
  const refusal = conflict ? t("teamRoster.mark.changed") : answer.refusal;
  if (mine) Object.assign(sheet, { refusal, busy: false });
  else if (visit.here) toast(refusal, { tone: "error" });
  draw();
  await again;
}

/**
 * «Mark the death»: the closure asked again, a step of the queue that waits included (K6; after a 422 whose read
 * failed the server's roster is asked for again, `refused`); nothing while a write of the fallen is on its way; then
 * one `POST …/death` on the revision the queue stands on, the sheet busy with it. Its answer is taken only for the
 * coach who sent it (T4 review's carry): another coach signed in since has nothing of it.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {Lent} lent
 */
async function sendDeath(saving, lent) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== "mark" || sheet.busy) return;
  const where = lent.now();
  const line = lineOf(where, sheet.key);
  const reason = line ? markClosed(line, where, { direct: true }) : "";
  const death = chosenMark(sheet.choice);
  if (reason) {
    toast(reason);
    lent.refused();
  }
  if (reason || fallenWriting(teamId) || !line || death?.code !== "dead") return;
  const coach = state.auth.currentUser?.id;
  sheet.busy = true;
  const sent = markDeath(teamId, line.id, { cause: death.cause, revision: savedRevision(teamId) });
  // Drawn once it is sent, so that every step and mark is drawn waiting for it (index.mjs's lock).
  draw();
  const answer = await sent;
  if (answer.ignored || state.auth.currentUser?.id !== coach) {
    sheet.busy = false;
    draw();
    return;
  }
  await heardDeath(saving, lent, { sheet, line, answer });
}

/**
 * What the marks' presses do (wire.mjs): «Miss a match…» opens the sheet, a reason, its characteristic or its words
 * are kept in it, «Mark the missed match» takes the step (`sendMark`), «Back on the roster» takes its own. A press on
 * one that is closed says why and does nothing.
 *
 * The sheet's `busy` is a write of it on its way: a missed match never is one (a step of the queue closes the sheet at
 * once), a death is (`sendDeath`), and the sheet's button sends nothing while it is.
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
  };
}

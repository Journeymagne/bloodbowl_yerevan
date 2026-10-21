/**
 * What a player's own controls do (stage 07d): the pencil opens his edit — number, name, the captaincy — and «Save» is
 * one step of the save queue; on a desk the edit also carries his SPP counters outside a match (owner's D3), each press
 * a step of its own as on a phone. «Advancement» (the profile's) and «Advance» (the desk's panel) open his advancement,
 * whose presses are advance.mjs's — a roster «Favoured of…» rolls the god's D8 with it (favoured.mjs; the owner,
 * 2026-10-21). «Undo the last: …» — in his fix by hand alone (decision 40) — asks first, then his last advancement
 * goes as one step (decision 18). None during a match (R8). What a sheet holds lives on the visit, as the marks' do.
 *
 * A skill's chip, in his row, his panel or his profile, opens the skill's rule (07a), saying how an advancement gave it;
 * for a roll on the site the team's rolls are read once a visit for what its dice showed (decision 19). The edit's and the
 * undo's sheets are drawn by player-sheets.mjs; the edit's tiles are the roster's counters, whose presses index.mjs's
 * `onStep` takes as every counter's. The edit leads to his fix by hand, whose sheet and presses are fix.mjs's. The
 * button of his profile's «Career» opens and closes its list (career.mjs), which reads and writes nothing of its own.
 */
import { t } from "../../../core/i18n.mjs";
import { toast } from "../../../components/toast.mjs";
import { identityOf } from "../../../domain/roster/edits.mjs";
import { advanceHandlers, advanceSheetOf } from "./advance.mjs";
import { careerHandlers } from "./career.mjs";
import { fixChanged, fixHandlers, fixSheetOf } from "./fix.mjs";
import { closeSheet, openerOf } from "./injury.mjs";
import { gaveWords, undoClosed } from "./player-access.mjs";
import { playerAt, rosterLineOf, savePlayerSheet, seededSheetOf } from "./player-save.mjs";
import { editCheck } from "./player-sheets.mjs";
import { siteRollOf } from "./roll-view.mjs";
import { readRolls } from "./rolls.mjs";
import { amendPlayer, undoAdvancement } from "./save.mjs";

/** An advancement as the undo's sheet showed it — its type, what it gave, its roll — which is what the coach confirms. */
const shownAs = ({ type, grants, via, rollId }) => JSON.stringify([type, grants?.skill ?? "", grants?.stat ?? "", via, rollId]);

/** The advancement the undo's sheet showed is still his last: in the same place, and the same advancement there. */
const stillLast = (sheet, line) => sheet.index === line.advancements.length - 1 && shownAs(line.advancements[sheet.index]) === sheet.confirmed;

/**
 * The undo's sheet while the advancement it showed is still his last (fix round 1: not by the count alone). A read that
 * brought another — one more or one fewer, or as many with another last (another device undid it and took a new one) —
 * closes it, saying so, and nothing is sent: a press must never undo what the coach did not see. The draw the undo's
 * own step makes (`sending`) finds the advancement gone, and says nothing.
 */
function undoSheetOf(sheet, line, where) {
  if (stillLast(sheet, line)) return { ...sheet, reason: undoClosed(line, where) };
  if (!sheet.sending) toast(t("teamPlayer.undo.changed"));
  return null;
}

/**
 * A player's sheet as the screen draws it, or null when it stands no longer: his line has left the roster (read again,
 * or fallen), or a match has begun (R8) — the screen closes it, and the focus goes back to his pencil or his
 * «Advancement», closed now (`openerOf`; the undo's to the pencil its fix was opened from). The edit stands while his
 * number, name and captaincy are as it was seeded from (final review M1), and the fix by hand while he is as it was
 * seeded from (fix.mjs's `fixSheetOf`), each saying why «Save» is closed just now (`editClosed`: the screen's lock) —
 * the same tie (player-save.mjs's `seededSheetOf`); his advancement is advance.mjs's to keep (`advanceSheetOf`); the
 * undo stands while the advancement it showed is still his last (`undoSheetOf`), saying why it is closed
 * (`undoClosed`).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function playerSheetOf(visit, lines, where) {
  const { sheet } = visit;
  const line = sheet ? rosterLineOf(lines, sheet.key) : null;
  if (!line || where.mode.kind === "match") return null;
  if (sheet.kind === "advance") return advanceSheetOf(sheet, line, where);
  if (sheet.kind === "unadvance") return undoSheetOf(sheet, line, where);
  if (sheet.kind === "fix") return fixSheetOf(sheet, line, where);
  return sheet.kind === "edit" ? seededSheetOf(sheet, line, where, { seedOf: identityOf, changed: "teamPlayer.edit.changed" }) : null;
}

/**
 * «Save» of the edit: the way a player's sheet is saved (player-save.mjs) — the form checked on the draft (`editCheck`:
 * a whole number and name, and a change), then one step of the queue (`amendPlayer`), his number, name and armband drawn
 * at once from the draft.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function saveEdit(saving, lent) {
  savePlayerSheet(saving, lent, {
    kind: "edit",
    check: ({ where, line }, form) => editCheck(where.draft, line, form),
    send: ({ line }, form, closed) => amendPlayer(saving.teamId, line.id, form, { closed }),
  });
}

/**
 * «Undo advancement»: only from the undo that is open, while the advancement it showed is still his last — a press that
 * finds none is a second press, and sends nothing. Why it is closed is asked again (K15), then one step of the queue
 * (`undoAdvancement`): what it gave goes, its SPP come back, and the save frees its site roll. In the same turn the
 * sheet closes, the focus on the pencil its fix was opened from — the step's own draw has closed it already
 * (`undoSheetOf`), so the pencil is asked for here (`openerOf`) — and the coach is told what came back. A refusal
 * (another tab's coach, the rules a 422 left the queue on) is said in the sheet, which stays; one of the queue's 422
 * asks for the server's roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function sendUndo(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  const where = sheet?.kind === "unadvance" ? now() : null;
  const line = where && rosterLineOf(where.lines, sheet.key);
  if (!line || !stillLast(sheet, line)) return;
  const reason = undoClosed(line, where);
  if (reason) {
    toast(reason);
    return;
  }
  const [what, opener] = [gaveWords(line.advancements[sheet.index]), visit.opener];
  sheet.sending = true;
  let answer;
  try {
    answer = undoAdvancement(teamId, line.id, { closed: () => undoClosed(line, now()) });
  } finally {
    sheet.sending = false;
  }
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  visit.rolls = null;
  closeSheet(saving);
  openerOf({ opener, sheet })?.focus();
  toast(t("teamPlayer.undo.done", { what, spp: answer.cost }));
}

/**
 * The visit's read of the team's rolls answers for a site advancement of his: it is on its way, or it holds that roll.
 * A list without it is older than the advancement — another device's, brought in by a read of the roster since — and is
 * read again (fix round 1); a read that failed is too.
 */
const rollsHold = (rolls, line, taken) => Boolean(rolls?.loading || (rolls?.rolls && siteRollOf(rolls.rolls, line, taken)));

/**
 * The team's rolls read for a skill a roll on the site gave (decision 19): once a visit — a second chip finds them read,
 * or on their way (`rollsHold`). None for a D8 a skill took the place of: a characteristic's roll has no dice to say.
 * A read again keeps the list read before while it is on its way, so a chip whose roll is in it says what its dice showed
 * meanwhile (final wave, T11 N5). The answer is taken only while the visit is here and asks for these rolls still: an
 * advancement taken, undone or a roll put on one since has made them old (`visit.rolls = null`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {import("./model.mjs").PlayerLine|null} line @param {string} name the skill as the roster writes it
 */
function readSiteRolls({ teamId, visit, draw }, line, name) {
  const at = line?.skills.find((skill) => skill.name === name)?.advancement ?? null;
  const taken = at === null ? null : line.advancements[at];
  if (taken?.via !== "site" || taken.type === "stat" || rollsHold(visit.rolls, line, taken)) return;
  const asked = { loading: true, rolls: visit.rolls?.rolls ?? null };
  visit.rolls = asked;
  void readRolls(teamId).then((answer) => {
    if (!visit.here || visit.rolls !== asked) return;
    visit.rolls = answer;
    draw();
  });
}

/**
 * What a player's own presses do (wire.mjs): a skill's chip opens its rule, reading the team's rolls for one a site
 * roll gave (`readSiteRolls`); the pencil opens his edit with his number, name and armband as they stand, unless
 * something closes it just now (said instead); a field typed in or the switch flipped changes the edit's form, and the
 * last refusal goes with the form it was said of; «Cancel» closes it, the focus back on the pencil; «Save» saves it
 * (`saveEdit`). «Undo the last» opens its sheet in the place of his fix by hand — only from that fix, open — on the
 * advancement that is his last at the press, unless something closes it or the fix's form is changed (said instead);
 * «Keep» closes it, «Undo advancement» sends it (`sendUndo`), the focus back on the pencil either way. His
 * advancement's presses are advance.mjs's (`advanceHandlers`), the god's D8 with them, his fix by hand's fix.mjs's
 * (`fixHandlers`), his career's button career.mjs's (`careerHandlers`).
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => object, refused: () => void}} lent what the screen lends: `now` is the screen as it stands at the
 *   press; `refused` asks for the server's roster again after a refusal of the queue's 422 whose read failed (index.mjs)
 */
export function playerHandlers(saving, lent) {
  const { visit, draw } = saving;
  // The edit that is open, changed: the same sheet, so that an answer on its way still finds it.
  const change = (fields) => {
    if (visit.sheet?.kind !== "edit") return;
    Object.assign(visit.sheet, { form: { ...visit.sheet.form, ...fields }, refusal: "" });
    draw();
  };
  return {
    ...advanceHandlers(saving, lent),
    ...fixHandlers(saving, lent),
    ...careerHandlers(saving),
    onSkill: (key, name, chip) => {
      Object.assign(visit, { sheet: { kind: "skill", key, name }, opener: chip });
      readSiteRolls(saving, rosterLineOf(lent.now().lines, key), name);
      draw();
    },
    onUnadvance: (key) => {
      const fix = visit.sheet?.kind === "fix" && visit.sheet.key === key ? visit.sheet : null;
      const where = fix ? lent.now() : null;
      const line = where && rosterLineOf(where.lines, key);
      if (!line?.advancements.length) return;
      const reason = undoClosed(line, where) || (fixChanged(where, line, fix.form) ? t("teamPlayer.fix.saveFirst") : "");
      if (reason) toast(reason);
      else {
        const index = line.advancements.length - 1;
        // In the fix's place, `visit.opener` kept: the pencil the fix was opened from, which «Keep» and a sent undo focus.
        visit.sheet = { kind: "unadvance", key, index, confirmed: shownAs(line.advancements[index]), refusal: "" };
        draw();
      }
    },
    onUnadvanceKeep: () => {
      if (visit.sheet?.kind === "unadvance") closeSheet(saving);
    },
    onUnadvanceSend: () => sendUndo(saving, lent),
    onEdit: (key, button) => {
      const player = playerAt(lent.now, key);
      if (player?.reason) toast(player.reason);
      else if (player) {
        const { number, name, captain } = player.line;
        // Tied to him as he is now (final review M1): its three values are absolute, and a save of them must never put back another device's change.
        Object.assign(visit, { sheet: { kind: "edit", key, form: { number, name, captain }, seed: identityOf(player.stored), refusal: "" }, opener: button });
        draw();
      }
    },
    onEditField: (field, value) => {
      if (field === "number" || field === "name") change({ [field]: String(value ?? "") });
    },
    onEditCaptain: (on) => change({ captain: Boolean(on) }),
    onEditKeep: () => {
      if (visit.sheet?.kind === "edit") closeSheet(saving);
    },
    onEditSave: () => saveEdit(saving, lent),
  };
}

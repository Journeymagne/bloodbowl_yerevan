/**
 * What a player's own controls do (stage 07d): the pencil opens his edit — number, name, the captaincy — and «Save» is
 * one step of the save queue; on a desk the edit also carries his SPP counters outside a match (owner's D3), each press
 * a step of its own as on a phone. «Advancement» (the profile's) and «Advance» (the desk's panel) open his advancement,
 * whose presses are advance.mjs's; its done step offers a roster «Favoured of…» the god's bonus skill, one step more
 * (decision 17). «Undo the last: …» asks first, then his last advancement goes as one step (decision 18). None during a
 * match (R8). What a sheet holds lives on the visit, as the marks' do.
 *
 * A skill's chip, in his row, his panel or his profile, opens the skill's rule (07a), saying how an advancement gave it;
 * for a roll on the site the team's rolls are read once a visit for its attempts (decision 19). The edit's and the
 * undo's sheets are drawn by player-sheets.mjs; the edit's tiles are the roster's counters, whose presses index.mjs's
 * `onStep` takes as every counter's.
 */
import { t } from "../../../core/i18n.mjs";
import { view } from "../../../core/view.mjs";
import { toast } from "../../../components/toast.mjs";
import { advanceHandlers, advanceSheetOf, bonusOf } from "./advance.mjs";
import { closeSheet, keyed } from "./injury.mjs";
import { editClosed, gaveWords, undoClosed } from "./player-access.mjs";
import { editCheck } from "./player-sheets.mjs";
import { siteRollOf } from "./roll-view.mjs";
import { readRolls } from "./rolls.mjs";
import { addFavoured, amendPlayer, undoAdvancement } from "./save.mjs";

/** The roster's line of `key`, never one of the fallen (whose number, name and armband are history), or null. */
const rosterLineOf = (lines, key) => lines.find((line) => line.key === key && !line.fallen) ?? null;

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
 * or fallen), or a match has begun (R8) — the screen closes it, and the focus goes back to his pencil, his
 * «Advancement» or his «Undo the last», closed now (`openerOf`). The edit says why «Save» is closed just now
 * (`editClosed`: the screen's lock); his advancement is advance.mjs's to keep (`advanceSheetOf`); the undo stands while
 * the advancement it showed is still his last (`undoSheetOf`), saying why it is closed (`undoClosed`).
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
  return sheet.kind === "edit" ? { ...sheet, reason: editClosed(line, where) } : null;
}

/**
 * The player of `key` as the screen stands at the press (`now`): his line on the roster, the draft the edit is checked
 * on, and why his edit cannot be saved just now ("" when it can); null when he is not on the roster.
 */
function playerOf(now, key) {
  const where = now();
  const line = rosterLineOf(where.lines, key);
  return line ? { line, draft: where.draft, reason: editClosed(line, where) } : null;
}

/**
 * «Save»: only from the edit that is open — a press that finds none is a second press, and sends nothing. Why it is
 * closed is asked again, then the form as the draft stands: one the roster would refuse, or that changes nothing, sends
 * nothing (the sheet says so, «Save» shut). Then one step of the queue (`amendPlayer`) and, in the same turn, the sheet
 * closes, the focus back on the pencil, his number, name and armband drawn at once from the draft. A refusal (another
 * tab's coach, the rules a 422 left the queue on) is said in the sheet, which stays; one of the queue's 422 asks for the
 * server's roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function saveEdit(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== "edit") return;
  const player = playerOf(now, sheet.key);
  if (!player) return;
  if (player.reason) {
    toast(player.reason);
    return;
  }
  const { refusal, changed } = editCheck(player.draft, player.line, sheet.form);
  if (refusal || !changed) return;
  const answer = amendPlayer(teamId, player.line.id, { ...sheet.form }, { closed: () => editClosed(player.line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  closeSheet(saving);
}

/**
 * «Undo the advancement»: only from the undo that is open, while the advancement it showed is still his last — a press
 * that finds none is a second press, and sends nothing. Why it is closed is asked again (K15), then one step of the
 * queue (`undoAdvancement`): what it gave goes, its SPP come back, and the save frees its site roll. In the same turn the
 * sheet closes, the focus on «Advancement» or «Advance», and the coach is told what came back. A refusal (another tab's
 * coach, the rules a 422 left the queue on) is said in the sheet, which stays; one of the queue's 422 asks for the
 * server's roster again (`refused`).
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
  const what = gaveWords(line.advancements[sheet.index]);
  sheet.sending = true;
  const answer = undoAdvancement(teamId, line.id, { closed: () => undoClosed(line, now()) });
  sheet.sending = false;
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  visit.rolls = null;
  closeSheet(saving);
  keyed("data-player-advance", sheet.key)?.focus();
  toast(t("teamPlayer.undo.done", { what, spp: answer.cost }));
}

/** The advancement's sheet on its done step while a god's bonus can still be added there, or null. */
const bonusSheet = (visit) => (visit.sheet?.kind === "advance" && visit.sheet.step === "done" && visit.sheet.favoured !== "added" ? visit.sheet : null);

/**
 * «Add …» under done (decision 17): only from the done step whose bonus is chosen and not yet added — a second press
 * finds it added, and sends nothing. Why it is closed is asked again (K15: `undoClosed`, a match begun before the screen
 * was drawn again), then one step of the queue (`addFavoured`, the domain's refusal in words). The block goes in the
 * same turn, the focus on the sheet's button, and the coach is told; a refusal is said in the block, which stays.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function addBonus(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const sheet = bonusSheet(visit);
  const where = sheet?.bonus ? now() : null;
  const line = where && rosterLineOf(where.lines, sheet.key);
  if (!line) return;
  const reason = undoClosed(line, where);
  if (reason) {
    toast(reason);
    return;
  }
  const answer = addFavoured(teamId, where.race, line.id, sheet.bonus, { closed: () => undoClosed(line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  Object.assign(sheet, { favoured: "added", refusal: "" });
  draw();
  view.querySelector("[data-advance-done]")?.focus();
  toast(t("teamPlayer.favoured.done", { skill: sheet.bonus }));
}

/**
 * The visit's read of the team's rolls answers for a site advancement of his: it is on its way, or it holds that roll.
 * A list without it is older than the advancement — another device's, brought in by a read of the roster since — and is
 * read again (fix round 1); a read that failed is too.
 */
const rollsHold = (rolls, line, taken) => Boolean(rolls?.loading || (rolls?.rolls && siteRollOf(rolls.rolls, line, taken)));

/**
 * The team's rolls read for a skill a roll on the site gave (decision 19): once a visit — a second chip finds them read,
 * or on their way (`rollsHold`). None for a D8 a skill took the place of: a characteristic's roll has no attempts to
 * show. The answer is taken only while the visit is here and asks for these rolls still: an advancement taken, undone
 * or a roll put on one since has made them old (`visit.rolls = null`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {import("./model.mjs").PlayerLine|null} line @param {string} name the skill as the roster writes it
 */
function readSiteRolls({ teamId, visit, draw }, line, name) {
  const at = line?.skills.find((skill) => skill.name === name)?.advancement ?? null;
  const taken = at === null ? null : line.advancements[at];
  if (taken?.via !== "site" || taken.type === "stat" || rollsHold(visit.rolls, line, taken)) return;
  const asked = { loading: true };
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
 * (`saveEdit`). «Undo the last» opens its sheet on the advancement that is his last at the press, unless something
 * closes it (said instead); «Keep» closes it, «Undo the advancement» sends it (`sendUndo`). On the advancement's done
 * step a bonus skill is chosen among those the god offers him and he lacks, and «Add …» adds it (`addBonus`). His
 * advancement's other presses are advance.mjs's (`advanceHandlers`).
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
    onSkill: (key, name, chip) => {
      Object.assign(visit, { sheet: { kind: "skill", key, name }, opener: chip });
      readSiteRolls(saving, rosterLineOf(lent.now().lines, key), name);
      draw();
    },
    onUnadvance: (key, button) => {
      const where = lent.now();
      const line = rosterLineOf(where.lines, key);
      const reason = line ? undoClosed(line, where) : "";
      if (reason) toast(reason);
      else if (line?.advancements.length) {
        const index = line.advancements.length - 1;
        Object.assign(visit, { sheet: { kind: "unadvance", key, index, confirmed: shownAs(line.advancements[index]), refusal: "" }, opener: button });
        draw();
      }
    },
    onUnadvanceKeep: () => {
      if (visit.sheet?.kind === "unadvance") closeSheet(saving);
    },
    onUnadvanceSend: () => sendUndo(saving, lent),
    // A skill the press does not find offered, or his own, is drawn back as it was: wireRadioGroups has flipped the group already.
    onFavoured: (skill) => {
      const sheet = bonusSheet(visit);
      const where = sheet ? lent.now() : null;
      const line = where && rosterLineOf(where.lines, sheet.key);
      if (line && bonusOf(line, where)?.skills.some(({ name, held }) => name === skill && !held)) Object.assign(sheet, { bonus: skill, refusal: "" });
      if (sheet) draw();
    },
    onFavouredAdd: () => addBonus(saving, lent),
    onEdit: (key, button) => {
      const player = playerOf(lent.now, key);
      if (player?.reason) toast(player.reason);
      else if (player) {
        const { number, name, captain } = player.line;
        Object.assign(visit, { sheet: { kind: "edit", key, form: { number, name, captain }, refusal: "" }, opener: button });
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

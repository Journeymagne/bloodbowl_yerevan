/**
 * Taking an advancement (spec UI §13; Adv1Type…Adv4Done on a phone, DeskRosterAdv on a desk): the type, then the
 * category, then the skill — or the roll (Task 10) — then done. Each choice is asked of the domain on the queue's draft
 * at the press, and the take is one step of the save queue that leaves the sheet on its done step in the same turn, so
 * a second press finds nothing to take. What the sheet holds lives on the visit; a phone walks it step by step, a desk
 * shows it in three columns.
 *
 * The sheet (`visit.sheet`) is `{kind: "advance", key, type, category, skill, step, refusal, taken}`: `step` is a
 * phone's — "type", "category", "skill", "stat" (Task 10) or "done"; a desk's columns show the first three at once —
 * and `taken` what the done step says, `{title, how, cost, value, elite, level}`. Its markup is advance-sheet.mjs's.
 */
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { toast } from "../../../components/toast.mjs";
import { ADVANCEMENT_TYPES, categorySkills } from "../../../domain/roster/progression.mjs";
import { rosterPlayerView } from "../../../domain/roster/players.mjs";
import { closeSheet } from "./injury.mjs";
import { advanceClosed } from "./panel.mjs";
import { advancePlayer, refusalWordsOf } from "./save.mjs";
import { ADVANCE_SHEET } from "./sheets.mjs";

/** The types whose skill the coach chooses from a list (Adv3Skill); a roll's — a random skill, a characteristic — are Task 10's. */
export const CHOSEN_TYPES = Object.freeze(["primary", "secondary"]);
/** Where «Back» goes from each step of a phone's sheet; a step it does not name has no way back. */
export const STEP_BEFORE = Object.freeze({ category: "type", skill: "category", stat: "type" });

/** The roster's line of `key`, never one of the fallen's (whose advancements are history), or null. */
const rosterLineOf = (lines, key) => lines.find((line) => line.key === key && !line.fallen) ?? null;

/**
 * What the sheet can choose for him on the draft `where` holds (the screen drawn, or the screen at the press): the offer
 * of each type (`line.offers`: its price at his next rank, what it adds, its categories, why it is refused), the offer
 * of the type chosen, its categories with how many of their skills he lacks, and the column of the category chosen as
 * `categorySkills` reads it — whether he holds each skill, whether it would complete an elite combination. Offers not
 * known yet (no Skill Table, K28) are none: nothing is refused for a table nobody has read.
 *
 * @param {import("./model.mjs").PlayerLine} line his line on the roster
 * @param {{type: string, category: string}} sheet
 * @param {{race: object|null, draft: object}} where
 */
export function choicesOf(line, sheet, where) {
  const offers = line.offers?.offers ?? [];
  const offer = offers.find(({ type }) => type === sheet.type) ?? null;
  const stored = where.draft?.players?.[line.index];
  const player = stored && where.race ? rosterPlayerView(where.race, stored, line.index) : null;
  const column = (category) => (player ? categorySkills(player.row, player, category, state.data?.skillGroups ?? []) : []);
  const categories = (offer?.categories ?? []).map(({ category }) => {
    const skills = column(category);
    return { category, total: skills.length, free: skills.filter(({ held }) => !held).length };
  });
  const skills = categories.some(({ category }) => category === sheet.category) ? column(sheet.category) : [];
  return { offers, offer, categories, skills };
}

/**
 * The advancement the sheet has chosen, whole, as `advancePlayer` takes it — a type whose skill is chosen from a list,
 * one of its categories, a skill of it he has not — with whether it completes an elite combination; null until it is.
 * @param {{type: string, skill: string}} sheet @param {ReturnType<typeof choicesOf>} choices
 */
export function chosenOf(sheet, choices) {
  const skill = CHOSEN_TYPES.includes(sheet.type) ? choices.skills.find(({ name, held }) => name === sheet.skill && !held) : null;
  return skill ? { type: sheet.type, grant: { skill: skill.name }, elite: skill.elite } : null;
}

/**
 * The advancement's sheet as the screen draws it (`playerSheetOf` hands it his line on the roster), or null when it
 * stands no longer: a match has begun (R8), or on its done step the advancement it shows is his no more — a refusal of
 * the queue's 422, or another device's save, took it away. Until it is taken it says why «Take» is closed just now.
 *
 * @param {object} sheet the visit's
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./injury.mjs").Where} where
 * @returns {object|null}
 */
export function advanceSheetOf(sheet, line, where) {
  if (where.mode.kind === "match") return null;
  if (sheet.step === "done") return line.level < sheet.taken.level ? null : sheet;
  return { ...sheet, reason: advanceClosed(line, where) };
}

/** The advancement's sheet while it is chosen in, or null: none open, another kind, or on its done step (a press there is a second press). */
const openSheet = (visit) => (visit.sheet?.kind === "advance" && visit.sheet.step !== "done" ? visit.sheet : null);

/** His line as the screen stands at the press (`now`), what the sheet offers him there, and why «Take» is closed ("" when it is not); null when he has left the roster. */
function playerAt(now, sheet) {
  const where = now();
  const line = rosterLineOf(where.lines, sheet.key);
  return line ? { line, where, choices: choicesOf(line, sheet, where), reason: advanceClosed(line, where) } : null;
}

/**
 * «Take»: only from the advancement that is open and not yet taken — a press that finds it on its done step is a second
 * press, and sends nothing. Why it is closed is asked again, then the choice on the draft as it stands: one not whole
 * sends nothing. Then one step of the queue (`advancePlayer`) and, in the same turn, the done step — what he got, how,
 * its price, what it adds to his value and his advancements now — drawn from the draft at once, the focus on its
 * button. A refusal (another tab's coach, the domain's words, the rules a 422 left the queue on) is said in the sheet,
 * which stays; one of the queue's 422 asks for the server's roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function takeChosen(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const sheet = openSheet(visit);
  const player = sheet && playerAt(now, sheet);
  if (!player) return;
  if (player.reason) {
    toast(player.reason);
    return;
  }
  const chosen = chosenOf(sheet, player.choices);
  if (!chosen) return;
  const { line, where } = player;
  const choice = { type: chosen.type, grant: chosen.grant };
  const answer = advancePlayer(teamId, where.race, line.id, choice, state.data?.skillGroups ?? [], { closed: () => advanceClosed(line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  const how = `${t(`teamAdvance.type.${chosen.type}`)} · ${sheet.category}`;
  const taken = { title: chosen.grant.skill, how, cost: answer.cost, value: answer.value, elite: chosen.elite, level: answer.level };
  Object.assign(sheet, { step: "done", refusal: "", taken });
  draw();
  view.querySelector("[data-advance-done]")?.focus();
}

/**
 * What the advancement's presses do (wire.mjs): «Advancement» or «Advance» opens the sheet on its first step, unless
 * something closes it just now (said instead); a type, a category or a skill chosen is kept in the sheet — only among
 * those offered on the draft at the press: a type refused there says why, and nothing changes; another type starts the
 * category and the skill again, another category the skill. On a phone «Next» and «Back» walk the steps; «Take» takes
 * it (`takeChosen`); «Cancel», «Back to the player» and «Done» close it, the focus back on what opened it.
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => object, refused: () => void}} lent what the screen lends: `now` is the screen as it stands at the
 *   press; `refused` asks for the server's roster again after a refusal of the queue's 422 whose read failed (index.mjs)
 */
export function advanceHandlers(saving, lent) {
  const { visit, draw } = saving;
  // The open sheet changed: the same object, so that an answer on its way still finds it; the last refusal goes with it.
  const change = (sheet, fields) => {
    Object.assign(sheet, fields, { refusal: "" });
    draw();
  };
  // The open sheet and its player at the press; none when it is not open, or he has left the roster.
  const pressed = () => {
    const sheet = openSheet(visit);
    const player = sheet && playerAt(lent.now, sheet);
    return player ? { sheet, ...player } : null;
  };
  const close = () => {
    if (visit.sheet?.kind === "advance") closeSheet(saving);
  };
  return {
    onAdvance: (key, button) => {
      const where = lent.now();
      const line = rosterLineOf(where.lines, key);
      const reason = line ? advanceClosed(line, where) : "";
      if (reason) toast(reason);
      else if (line) {
        Object.assign(visit, { sheet: { kind: "advance", key, type: "", category: "", skill: "", step: "type", refusal: "", taken: null }, opener: button });
        draw();
      }
    },
    // A choice the press does not find offered is drawn back as it was: wireRadioGroups has flipped the group already.
    onAdvanceType: (type) => {
      const now = pressed();
      if (!now) return;
      const refusal = now.choices.offers.find((offer) => offer.type === type)?.refusal;
      if (refusal) toast(refusalWordsOf("teamAdvance", refusal));
      if (refusal || !ADVANCEMENT_TYPES.includes(type)) draw();
      else change(now.sheet, { type, category: "", skill: "" });
    },
    onAdvanceCategory: (category) => {
      const now = pressed();
      if (now?.choices.categories.some((each) => each.category === category && each.free > 0)) change(now.sheet, { category, skill: "" });
      else if (now) draw();
    },
    onAdvanceSkill: (name) => {
      const now = pressed();
      if (now?.choices.skills.some((each) => each.name === name && !each.held)) change(now.sheet, { skill: name });
      else if (now) draw();
    },
    // A phone's «Next»: a type's categories, or a characteristic's roll (Task 10); a category's skills. A type refused
    // since it was chosen (his SPP gone down) goes no further, and says why.
    onAdvanceNext: () => {
      const now = pressed();
      const refusal = now?.choices.offer?.refusal;
      if (refusal) toast(refusalWordsOf("teamAdvance", refusal));
      else if (now?.sheet.step === "type" && now.sheet.type) change(now.sheet, { step: now.sheet.type === "stat" ? "stat" : "category" });
      else if (now?.sheet.step === "category" && now.sheet.category) change(now.sheet, { step: "skill" });
    },
    onSheetBack: (id) => {
      const sheet = id === ADVANCE_SHEET ? openSheet(visit) : null;
      if (STEP_BEFORE[sheet?.step]) change(sheet, { step: STEP_BEFORE[sheet.step] });
    },
    onAdvanceTake: () => takeChosen(saving, lent),
    onAdvanceKeep: close,
    onAdvanceDone: close,
  };
}

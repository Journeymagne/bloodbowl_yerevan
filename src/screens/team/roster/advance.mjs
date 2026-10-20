/**
 * Taking an advancement (spec UI §13; Adv1Type…Adv4Done, Adv3Random, Adv3Stat, Adv3StatTable on a phone, DeskRosterAdv
 * and DeskRosterAdvStat on a desk): the type, then the category, then the skill — or the roll — then done. Each choice is
 * asked of the domain on the queue's draft at the press, and the take is one step of the save queue that leaves the sheet
 * on its done step in the same turn, so a second press finds nothing to take. What the sheet holds lives on the visit; a
 * phone walks it step by step, a desk shows it in three columns.
 *
 * A random skill and a characteristic are rolled (stage 07d, Task 10; decisions 9–13): declared first — the type, and a
 * random skill's category — then rolled on the site (`askRoll`: the server keeps the roll until an advancement takes it,
 * and answers the same ask with it) or at the table (the coach presses the face). Once a roll is made on the site the
 * type, the category and the way are fixed and there is no way back: closing the sheet leaves the roll the player's. A
 * skill may take a characteristic's place, from the primary and the secondary categories at the characteristic's price.
 *
 * The sheet (`visit.sheet`) is `{kind: "advance", key, type, category, skill, step, refusal, taken, via, roll, face,
 * stat, instead, asking, waiting, lost, attempts, asked}`: `step` is a phone's — "type", "category", "skill", "stat" or
 * "done"; a desk's columns show the first three at once — and `taken` what the done step says, `{title, how, cost, value,
 * elite, level, ownTitle}`. `via` is "site" or "table"; `roll` the site's roll as the server answered it, null before;
 * `face` the face that came up — the coach's at the table (the D16's or the D8's), the site's D8; `stat` the
 * characteristic chosen; `instead` a skill in place of it; `asking` while an ask is out; `waiting` the purpose of a roll
 * of the other kind that waits for the player (409 `DICE_ROLL_WAITING`); `lost` an ask whose answer did not come;
 * `attempts` the attempts shown; `asked` the category an ask was made in. On the done step, `bonus` is a god's bonus
 * skill chosen and `favoured` "added" once it is (decision 17; player.mjs, Task 11). Its markup is advance-sheet.mjs's
 * and roll-view.mjs's.
 */
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { toast } from "../../../components/toast.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { STAT_ROLL_TABLE, rollRefusal, tableAdvancementFor } from "../../../domain/roster/dice.mjs";
import { favouredBonus } from "../../../domain/roster/edits.mjs";
import { ADVANCEMENT_TYPES, advancementCategories, categorySkills, statChoices } from "../../../domain/roster/progression.mjs";
import { rosterPlayerView } from "../../../domain/roster/players.mjs";
import { closeSheet } from "./injury.mjs";
import { advanceClosed, undoClosed } from "./player-access.mjs";
import { askRoll } from "./rolls.mjs";
import { advancePlayer, bindRoll, refusalWordsOf } from "./save.mjs";
import { ADVANCE_SHEET } from "./sheets.mjs";

/** The types whose skill the coach chooses from a list (Adv3Skill); a roll's — a random skill, a characteristic — are rolled. */
export const CHOSEN_TYPES = Object.freeze(["primary", "secondary"]);
/** The die each rolled type asks the server for (`POST …/rolls`' purpose). */
export const PURPOSE_OF = Object.freeze({ random: "random_skill", stat: "stat" });
/** Where «Back» goes from each step of a phone's sheet; a step it does not name has no way back (`stepBefore`). */
export const STEP_BEFORE = Object.freeze({ category: "type", skill: "category", stat: "type" });
/** A type chosen afresh: on the site, nothing rolled, nothing asked. A roll of the other kind that waits still does. */
const UNROLLED = Object.freeze({ via: "site", roll: null, face: null, stat: "", instead: false, lost: false, attempts: false, asked: "" });

/** The roster's line of `key`, never one of the fallen's (whose advancements are history), or null. */
const rosterLineOf = (lines, key) => lines.find((line) => line.key === key && !line.fallen) ?? null;

/** Him on the draft `where` holds (`rosterPlayerView`: his position's row on him), or null when the draft or the race has him not. */
function playerOn(line, where) {
  const stored = where.draft?.players?.[line.index];
  return stored && where.race ? rosterPlayerView(where.race, stored, line.index) : null;
}

/**
 * The god's bonus skill a roster «Favoured of…» may bring him with an advancement (decision 17, owner's answer 3), on
 * the draft `where` holds (`favouredBonus`): the alignment, the D8's number, whether it is rolled for, the skills with
 * his own marked; null for a roster with no favour.
 * @param {import("./model.mjs").PlayerLine} line @param {{race: object|null, draft: object}} where
 */
export function bonusOf(line, where) {
  const player = playerOn(line, where);
  return player ? favouredBonus(where.race, where.draft, player.row, player) : null;
}

/**
 * What the sheet can choose for him on the draft `where` holds (the screen drawn, or the screen at the press): the offer
 * of each type (`line.offers`: its price at his next rank, what it adds, its categories, why it is refused), the offer
 * of the type chosen, its categories with how many of their skills he lacks — a skill in place of a characteristic, the
 * primary and the secondary (decision 13) — and the column of the category chosen as `categorySkills` reads it: whether
 * he holds each skill, whether it would complete an elite combination. With a roll: the characteristics the D8's face
 * offers (`statChoices`), and why the site's roll cannot be taken as it is (`rollRefusal`). `player` is him on the
 * draft, his position's row on him. Offers not known yet (no Skill Table, K28) are none: nothing is refused for a table
 * nobody has read.
 *
 * @param {import("./model.mjs").PlayerLine} line his line on the roster
 * @param {{type: string, category: string, instead?: boolean, face?: number|null, roll?: object|null}} sheet
 * @param {{race: object|null, draft: object}} where
 */
export function choicesOf(line, sheet, where) {
  const offers = line.offers?.offers ?? [];
  const offer = offers.find(({ type }) => type === sheet.type) ?? null;
  const player = playerOn(line, where);
  const column = (category) => (player ? categorySkills(player.row, player, category, state.data?.skillGroups ?? []) : []);
  const listed = sheet.instead ? (offer && player ? advancementCategories(player.row, "stat", { instead: true }) : []) : offer?.categories ?? [];
  const categories = listed.map(({ category }) => {
    const skills = column(category);
    return { category, total: skills.length, free: skills.filter(({ held }) => !held).length };
  });
  const skills = categories.some(({ category }) => category === sheet.category) ? column(sheet.category) : [];
  const stats = player && sheet.type === "stat" && sheet.face ? statChoices(player.row, player, sheet.face) : [];
  const rollRefused = player && sheet.roll ? rollRefusal(sheet.roll, player.row, player) : null;
  return { offers, offer, categories, skills, player, stats, rollRefused };
}

/** The roll an advancement of a rolled type names — the site's by its id, with its data (`siteRoll`, which no body carries), or the table's — none for a chosen type; null while there is none to name. */
function namedRoll(sheet) {
  if (!PURPOSE_OF[sheet.type]) return {};
  if (sheet.via === "site") return sheet.roll ? { roll: { id: sheet.roll.id, via: "site" }, siteRoll: sheet.roll } : null;
  return sheet.face ? { roll: { via: "table" } } : null;
}

/**
 * The advancement the sheet has chosen, whole, as `advancePlayer` takes it, with whether it completes an elite
 * combination; null until it is. A skill of the list he has not (a chosen type's, or one in place of a characteristic);
 * a random skill's — the site's roll as it is (whether he can take it is `rollRefusal`'s: the sheet says so and «Take»
 * is closed), or at the table a face of the column with a skill he lacks; a characteristic the D8's face offers him.
 * @param {object} sheet @param {ReturnType<typeof choicesOf>} choices
 */
export function chosenOf(sheet, choices) {
  const named = namedRoll(sheet);
  if (!named) return null;
  if (CHOSEN_TYPES.includes(sheet.type) || (sheet.type === "stat" && sheet.instead)) {
    const skill = choices.skills.find(({ name, held }) => name === sheet.skill && !held);
    return skill ? { type: sheet.type, grant: { skill: skill.name }, elite: skill.elite, ...named } : null;
  }
  if (sheet.type === "random") {
    const name = sheet.via === "site" ? sheet.roll.result?.skill : sheet.skill;
    const skill = choices.skills.find((each) => each.name === name);
    if (typeof name !== "string" || !name || (sheet.via === "table" && (!skill || skill.held))) return null;
    return { type: "random", grant: { skill: name }, elite: Boolean(skill?.elite), ...named };
  }
  const option = sheet.type === "stat" ? choices.stats.find(({ stat, refusal }) => stat === sheet.stat && !refusal) : null;
  return option ? { type: "stat", grant: { stat: option.stat }, elite: false, ...named } : null;
}

/** Why a type of the other kind than the roll that waits for the player cannot be rolled (409 `DICE_ROLL_WAITING`, decision 11); "" for any other. */
export function waitingWords(sheet, type) {
  const purpose = PURPOSE_OF[type];
  return purpose && sheet.waiting && purpose !== sheet.waiting ? t(`teamAdvance.waiting.${sheet.waiting}`) : "";
}

/** Why the type (and a random skill's category) can no longer change: a roll on the site is made for this sheet, and stays the player's (decision 9). */
export function keptWords(sheet) {
  return sheet.roll ? t("teamAdvance.kept") : "";
}

/** Why the type chosen goes no further just now, "" when it can: refused on the draft as drawn (his SPP gone down since), or a roll of the other kind waiting. */
export function refusedWords(sheet, choices) {
  return (choices.offer?.refusal ? refusalWordsOf("teamAdvance", choices.offer.refusal) : "") || waitingWords(sheet, sheet.type);
}

/**
 * Whether the way the roll is made is fixed: a roll is made on the site, and the player can take it as it is. One that
 * cannot be taken — `ROLL_STALE`, `ROLL_REROLLED`, whose words say «or take this advancement at the table» — leaves the
 * table open (decision 11; fix round 1, I2): the site's roll keeps waiting for the player either way.
 */
export function wayFixed(sheet, choices) {
  return Boolean(sheet.roll) && !choices.rollRefused;
}

/** The line under the way: what the site does, what to press at the table, or how the roll was made. */
export function noteWords(sheet) {
  if (sheet.via === "site") return sheet.roll ? t("teamAdvance.note.rolledSite") : t("teamAdvance.note.site");
  if (sheet.face) return t("teamAdvance.note.rolledTable");
  return sheet.type === "stat" ? t("teamAdvance.note.tableD8") : t("teamAdvance.note.table");
}

/**
 * Why «Roll D16» or «Roll D8» has nothing to roll, "" when it has: the roll is made and stays the player's, or the die is
 * the table's (DeskRosterAdv keeps a desk's «Roll D16» drawn, closed; fix round 1, M1).
 */
export function rolledWords(sheet) {
  if (sheet.roll && sheet.via === "site") return keptWords(sheet);
  return sheet.via === "table" ? noteWords(sheet) : "";
}

/** Whether the site's roll can be put on the random advancement taken at the table that gave its skill (`tableAdvancementFor`, T1 review Minor 4). */
export function bindable(sheet, choices) {
  return sheet.via === "site" && choices.rollRefused?.code === "ROLL_STALE" && tableAdvancementFor(sheet.roll, choices.player) >= 0;
}

/**
 * Where «Back» goes from a phone's step, "" for none: none while a roll is asked, and none once the die has come up —
 * on the site or at the table (decision 9, Adv3Random) — but a skill in place of a characteristic goes back to the D8's
 * choice, the face kept.
 */
export function stepBefore(sheet) {
  if (sheet.asking) return "";
  if (sheet.instead) return sheet.step === "category" ? "stat" : STEP_BEFORE[sheet.step] ?? "";
  const rolled = Boolean(sheet.roll || sheet.face) && (sheet.step === "stat" || sheet.step === "skill");
  return rolled ? "" : STEP_BEFORE[sheet.step] ?? "";
}

/**
 * Why no roll is asked just now, "" when one may be: what closes the advancement (`advanceClosed`: a match, the lock, no
 * id), or a step of the queue that waits or is on its way (decision 10): the server rolls on the roster it holds.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string, save: {status: string, waiting: number}}} where
 */
export function rollClosed(line, where) {
  const reason = advanceClosed(line, where);
  if (reason) return reason;
  const { status, waiting } = where.save;
  return waiting > 0 || status === SAVE_STATUS.SAVING || status === SAVE_STATUS.DIRTY ? t("teamRoster.mark.waitSave") : "";
}

/**
 * The advancement's sheet as the screen draws it (`playerSheetOf` hands it his line on the roster), or null when it
 * stands no longer: a match has begun (R8), or on its done step the advancement it shows is his no more — a refusal of
 * the queue's 422, or another device's save, took it away. Until it is taken it says why «Take» (`reason`) and a roll
 * (`rollReason`) are closed just now; on its done step, why a god's bonus cannot be added (`reason`: `undoClosed`).
 *
 * @param {object} sheet the visit's
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./injury.mjs").Where} where
 * @returns {object|null}
 */
export function advanceSheetOf(sheet, line, where) {
  if (where.mode.kind === "match") return null;
  if (sheet.step === "done") return line.level < sheet.taken.level ? null : { ...sheet, reason: undoClosed(line, where) };
  return { ...sheet, reason: advanceClosed(line, where), rollReason: rollClosed(line, where) };
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
 * What the done step says of what was taken: what it gave, and how — its type, its category, the way its roll was made,
 * or that a skill took a characteristic's place; a desk's `howDesk` names the type short, as DeskRosterAdv does.
 */
function takenWords(sheet, chosen, choices) {
  const way = chosen.roll ? t(`teamPlayer.via.${chosen.roll.via}`) : "";
  const hows = (rest) => ({ how: [t(`teamAdvance.type.${chosen.type}`), ...rest].join(" · "), howDesk: [t(`teamAdvance.typeShort.${chosen.type}`), ...rest].join(" · ") });
  if (chosen.grant.stat) {
    const { stat, before, after } = choices.stats.find((each) => each.stat === chosen.grant.stat);
    return { title: t("teamAdvance.doneStat", { stat: t(`stats.${stat}`), before, after }), ...hows([way]), ownTitle: true };
  }
  const rest = sheet.instead ? [sheet.category, t("teamAdvance.howInstead")] : [sheet.category, way].filter(Boolean);
  return { title: chosen.grant.skill, ...hows(rest), ownTitle: false };
}

/**
 * «Take»: only from the advancement that is open and not yet taken — a press that finds it on its done step is a second
 * press, and sends nothing. Why it is closed is asked again, then the choice on the draft as it stands: one not whole
 * sends nothing. Then one step of the queue (`advancePlayer`, naming the site's roll by its id) and, in the same turn,
 * the done step — what he got, how, its price, what it adds to his value and his advancements now — drawn from the draft
 * at once, the focus on its button. A closed «Take» says why on a press, as it says it in its title, and sends nothing
 * (fix round 1, M3): the type refused on the draft at the press, a roll of the other kind waiting, a site roll the player
 * cannot take as it is. A refusal of the step (another tab's coach, the domain's words, the rules a 422 left the queue
 * on) is said in the sheet, which stays; one of the queue's 422 asks for the server's roster again (`refused`).
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
  const { line, where, choices } = player;
  const chosen = chosenOf(sheet, choices);
  const why = refusedWords(sheet, choices) || (chosen?.siteRoll && choices.rollRefused ? refusalWordsOf("teamAdvance", choices.rollRefused) : "");
  if (why) {
    toast(why);
    return;
  }
  if (!chosen) return;
  const { elite, ...choice } = chosen;
  const answer = advancePlayer(teamId, where.race, line.id, choice, state.data?.skillGroups ?? [], { closed: () => advanceClosed(line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  const taken = { ...takenWords(sheet, chosen, choices), cost: answer.cost, value: answer.value, elite, level: answer.level };
  // The rolls the visit read are the team's before this one was taken: read again for the next skill's sheet.
  visit.rolls = null;
  Object.assign(sheet, { step: "done", refusal: "", taken });
  draw();
  view.querySelector("[data-advance-done]")?.focus();
}

/** What an ask's answer makes of the sheet (decision 11): the roll as it is — a random skill's in its own category, a D8's face — or why there is none. */
function answerFields(sheet, purpose, answer) {
  if (answer.lost) return { lost: true };
  if (answer.waiting) return { waiting: answer.waiting };
  if (answer.refusal) return { refusal: answer.refusal };
  const { roll } = answer;
  if (!roll) return {};
  if (roll.purpose !== purpose) return { waiting: roll.purpose };
  const taken = { roll, via: "site", waiting: "", lost: false, attempts: false };
  if (purpose === "stat") return { ...taken, face: roll.result.roll, stat: "" };
  return { ...taken, category: roll.params?.category ?? sheet.category, skill: roll.result.skill, face: null };
}

/**
 * «Roll D16» or «Roll D8»: only from the advancement open on a rolled type declared whole (a random skill's category), on
 * the site, with nothing rolled and nothing asked — a second press while the ask is out sends nothing. Closed (the roll
 * made, the die the table's, the screen's reason, a step of the queue that waits or is on its way, a roll of the other
 * kind waiting) it says why and asks nothing. The ask (`askRoll`) hears why the screen is closed at the press again (K15) and whether the session is
 * still this page's coach's. Its answer is taken only while this very sheet is open on this visit: a match begun
 * meanwhile has closed it, and the answer finds nothing to take. A player the server has not reads the roster again.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, readAgain: () => void}} lent
 * @param {{sheet: object, line: object, where: object}|null} pressed the open sheet and its player at the press
 */
async function askFor({ teamId, visit, draw }, { now, readAgain }, pressed) {
  const sheet = pressed?.sheet;
  const purpose = PURPOSE_OF[sheet?.type];
  if (!purpose || sheet.asking || sheet.instead || (purpose === "random_skill" && !sheet.category)) return;
  const reason = rolledWords(sheet) || rollClosed(pressed.line, pressed.where) || waitingWords(sheet, sheet.type);
  if (reason) {
    toast(reason);
    return;
  }
  const { line } = pressed;
  Object.assign(sheet, { asking: true, lost: false, refusal: "", asked: sheet.category });
  draw();
  const answer = await askRoll(teamId, line.id, { purpose, category: sheet.category, closed: () => rollClosed(line, now()) });
  if (!visit.here) return;
  if (visit.sheet === sheet) Object.assign(sheet, { asking: false }, answerFields(sheet, purpose, answer));
  if (answer.code === "PLAYER_NOT_FOUND") void readAgain();
  draw();
}

/**
 * «Record this roll for the advancement «…» taken at the table» (decision 11, §3.4): a stale roll takes the place of the
 * random advancement taken at the table that gave its skill — one step of the queue (`bindRoll`), which asks why the
 * screen is closed at the press (K15). The sheet closes in the same turn, and the coach is told; a refusal is said in it.
 */
function bindSiteRoll(saving, { now, refused }, pressed) {
  const sheet = pressed?.sheet;
  if (!sheet || !bindable(sheet, pressed.choices)) return;
  if (pressed.reason) {
    toast(pressed.reason);
    return;
  }
  const { line } = pressed;
  const answer = bindRoll(saving.teamId, line.id, sheet.roll, { closed: () => advanceClosed(line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    saving.draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  saving.visit.rolls = null;
  closeSheet(saving);
  toast(t("teamAdvance.bound", { skill: sheet.roll.result.skill }));
}

/** The fields a face the coach presses at the table gives the sheet: a D16's — only a face of the column with a skill he lacks; a D8's — any; null for none. */
function pressedFace(sheet, choices, face) {
  if (sheet.via !== "table" || sheet.asking || sheet.instead || !Number.isInteger(face)) return null;
  if (sheet.type === "stat") return STAT_ROLL_TABLE.some(({ from, to }) => face >= from && face <= to) ? { face, stat: "" } : null;
  const skill = sheet.type === "random" ? choices.skills[face - 1] : null;
  return skill && !skill.held ? { face, skill: skill.name } : null;
}

/**
 * The roll's presses: the way (before a roll on the site, or after one the player cannot take as it is); «Roll D16» and
 * «Roll D8» (`askFor`); a face at the table, again and again until the advancement is taken; a characteristic the face
 * offers, refused ones never; a skill in place of the characteristic once the D8 has come up, and a desk's way back from
 * it; the attempts shown or hidden; a stale roll put on a table advancement (`bindSiteRoll`).
 */
function rollHandlers(saving, lent, { pressed, change }) {
  const { visit, draw } = saving;
  return {
    onAdvanceVia: (via) => {
      const now = pressed();
      if (!now) return;
      const { sheet } = now;
      if (sheet.asking || !PURPOSE_OF[sheet.type] || !["site", "table"].includes(via) || wayFixed(sheet, now.choices)) draw();
      else change(sheet, { via, face: null, stat: "", instead: false, skill: via === "site" && sheet.roll ? sheet.roll.result.skill : "" });
    },
    onAdvanceRoll: () => askFor(saving, lent, pressed()),
    onAdvanceFace: (face) => {
      const now = pressed();
      const fields = now && pressedFace(now.sheet, now.choices, face);
      if (fields) change(now.sheet, fields);
      else if (now) draw();
    },
    onAdvanceStat: (stat) => {
      const now = pressed();
      if (now?.choices.stats.some((each) => each.stat === stat && !each.refusal)) change(now.sheet, { stat });
      else if (now) draw();
    },
    onAdvanceInstead: () => {
      const now = pressed();
      if (now?.sheet.type === "stat" && now.sheet.face && !now.sheet.instead) change(now.sheet, { instead: true, step: "category", category: "", skill: "" });
    },
    // A desk's way back from a skill in place of the characteristic (fix round 1, M2; a phone's is «Back»): the D8's
    // choice again, the face kept, the focus on «Take a skill in place…», which is drawn again.
    onAdvanceStatBack: () => {
      const sheet = openSheet(visit);
      if (!sheet?.instead) return;
      change(sheet, { instead: false, step: "stat", category: "", skill: "" });
      view.querySelector("[data-advance-instead]")?.focus();
    },
    onAdvanceAttempts: () => {
      const sheet = openSheet(visit);
      if (!sheet?.roll) return;
      sheet.attempts = !sheet.attempts;
      draw();
    },
    onAdvanceBind: () => bindSiteRoll(saving, lent, pressed()),
  };
}

/**
 * What the advancement's presses do (wire.mjs): «Advancement» or «Advance» opens the sheet on its first step, unless
 * something closes it just now (said instead); a type, a category or a skill chosen is kept in the sheet — only among
 * those offered on the draft at the press, and not while a roll is asked: a type refused there, or closed by a roll
 * (one of the other kind waiting, this sheet's made), says why, and nothing changes; another type starts the category,
 * the skill and the roll again, another category the skill. On a phone «Next» and «Back» walk the steps; «Take» takes
 * it (`takeChosen`); «Cancel», «Back to the player» and «Done» close it, the focus back on what opened it. The roll's
 * presses are `rollHandlers`'.
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => object, refused: () => void, readAgain: () => void}} lent what the screen lends: `now` is the screen
 *   as it stands at the press; `refused` asks for the server's roster again after a refusal of the queue's 422 whose read
 *   failed; `readAgain` reads the roster again (index.mjs)
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
        const sheet = { kind: "advance", key, type: "", category: "", skill: "", step: "type", refusal: "", taken: null, ...UNROLLED, asking: false, waiting: "" };
        Object.assign(visit, { sheet, opener: button });
        draw();
      }
    },
    // A choice the press does not find offered is drawn back as it was: wireRadioGroups has flipped the group already.
    onAdvanceType: (type) => {
      const now = pressed();
      if (!now) return;
      const refusal = now.choices.offers.find((offer) => offer.type === type)?.refusal;
      const words = (refusal ? refusalWordsOf("teamAdvance", refusal) : "") || waitingWords(now.sheet, type) || keptWords(now.sheet);
      if (words) toast(words);
      if (words || now.sheet.asking || !ADVANCEMENT_TYPES.includes(type)) draw();
      else change(now.sheet, { type, category: "", skill: "", ...UNROLLED });
    },
    onAdvanceCategory: (category) => {
      const now = pressed();
      const fixed = now && (now.sheet.asking || (now.sheet.type === "random" && now.sheet.roll));
      // A random skill's category starts its die again; a skill in place of a characteristic keeps the D8's face.
      const again = now?.sheet.type === "random" ? { face: null, lost: false } : {};
      if (!fixed && now?.choices.categories.some((each) => each.category === category && each.free > 0)) change(now.sheet, { category, skill: "", ...again });
      else if (now) draw();
    },
    onAdvanceSkill: (name) => {
      const now = pressed();
      if (now?.choices.skills.some((each) => each.name === name && !each.held)) change(now.sheet, { skill: name });
      else if (now) draw();
    },
    // A phone's «Next»: a type's categories, or a characteristic's roll; a category's skills, or its roll. A type refused
    // since it was chosen (his SPP gone down), or closed by a roll of the other kind waiting, goes no further, and says why.
    onAdvanceNext: () => {
      const now = pressed();
      const words = now ? refusedWords(now.sheet, now.choices) : "";
      if (words) toast(words);
      else if (now?.sheet.step === "type" && now.sheet.type) change(now.sheet, { step: now.sheet.type === "stat" ? "stat" : "category" });
      else if (now?.sheet.step === "category" && now.sheet.category) change(now.sheet, { step: "skill" });
    },
    onSheetBack: (id) => {
      const sheet = id === ADVANCE_SHEET ? openSheet(visit) : null;
      const before = sheet ? stepBefore(sheet) : "";
      if (before) change(sheet, { step: before, ...(before === "stat" ? { instead: false, category: "", skill: "" } : {}) });
    },
    onAdvanceTake: () => takeChosen(saving, lent),
    onAdvanceKeep: close,
    onAdvanceDone: close,
    ...rollHandlers(saving, lent, { pressed, change }),
  };
}

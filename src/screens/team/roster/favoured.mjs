/**
 * The god's D8 with an advancement (the owner, 2026-10-21; content «Team Management», «Favoured of…»: «Every time a
 * player receives an advancement, roll a d8»), asked by the advancement's sheet before «Take» — on the roster and in the
 * post-match alike (stage 09b, Task 10; it reverses 07d decision 17, the bonus after done if wanted). A roster «Favoured
 * of…» rolls it at the table with every advancement: on the god's face the player may gain one of the god's skills at no
 * cost to the value — or none —, on any other nothing. «Take» waits for the face, and on the god's face for the choice.
 * Not asked — and said so — when the player holds every skill the god offers once this advancement is his
 * (`favouredRollAsked`, the post-match's domain asks it the same).
 *
 * The sheet keeps `favouredRoll` (the face marked, null before) and `bonus` (the choice on the god's face: a skill, or
 * `NO_BONUS`); the done step says what came of it (`taken.favoured`). The roster's take adds the skill in the
 * advancement's own step (`advancePlayer`'s `favoured`): one save; the post-match's `advance` carries the D8 and the skill
 * (`favouredRoll`, `favouredSkill`), as 2.x's did.
 */
import { favouredRollAsked } from "../../../domain/roster/edits.mjs";
import { canonicalSkillName } from "../../../domain/roster/players.mjs";

/** The D8's faces. */
const FACES = 8;

/** The choice on the god's face that takes none of his skills. */
export const NO_BONUS = "none";

/**
 * The god's D8 as it stands for the advancement the sheet has chosen (`chosen`, null until it is whole): null for a roster
 * with no favour (`bonus`, advance.mjs's `bonusOf`); else the bonus with its skills — his own held, and the one this
 * advancement gives him (`given`) —, whether the D8 is asked, the face marked, whether it is the god's, the choice on it
 * (a skill he lacks, or `NO_BONUS`; "" for none yet), the skill it gives ("" for none), and whether «Take» waits for it.
 * @param {null | {alignment: string, trigger: number, random: boolean, skills: {name: string, held: boolean}[]}} bonus
 * @param {{favouredRoll?: number|null, bonus?: string|null}} sheet @param {{grant: {skill?: string}}|null} chosen
 */
export function favouredOf(bonus, sheet, chosen) {
  if (!bonus) return null;
  const gives = chosen?.grant?.skill ? canonicalSkillName(chosen.grant.skill) : "";
  const skills = bonus.skills.map((skill) => {
    const given = !skill.held && canonicalSkillName(skill.name) === gives;
    return { ...skill, given, held: skill.held || given };
  });
  const asked = favouredRollAsked({ skills });
  const face = asked && Number.isInteger(sheet.favouredRoll) ? sheet.favouredRoll : null;
  const hit = face === bonus.trigger;
  const open = skills.some(({ name, held }) => name === sheet.bonus && !held);
  const choice = hit && (sheet.bonus === NO_BONUS || open) ? sheet.bonus : "";
  const skill = choice === NO_BONUS ? "" : choice;
  return { ...bonus, skills, asked, face, hit, choice, skill, waits: asked && (!face || (hit && !choice)) };
}

/** What the post-match's `advance` carries of it: the D8 and the skill on the god's face ("" for none); nothing when it is not asked. */
export const favouredFields = (god) => (god?.asked ? { favouredRoll: god.face, favouredSkill: god.skill } : {});

/** What the done step says of it (`taken.favoured`): the god, whether the D8 was asked, its face and the skill it gave; null for no favour. */
export const favouredTaken = (god) => (god ? { alignment: god.alignment, asked: god.asked, face: god.face, hit: god.hit, skill: god.skill } : null);

/**
 * The presses of the god's D8 (wire.mjs), on the advancement open and not yet taken (`pressed`, advance.mjs's): a face —
 * any one, pressed again until the advancement is taken; another face starts the choice again —, then on the god's face
 * one of his skills the player lacks, or «No bonus». Any other press is drawn back as it was: wireRadioGroups has flipped
 * the group already.
 * @param {() => ({sheet: object, god: ReturnType<typeof favouredOf>} | null)} pressed
 * @param {(sheet: object, fields: object) => void} change @param {() => void} draw
 */
export function favouredHandlers(pressed, change, draw) {
  return {
    onFavouredRoll: (face) => {
      const now = pressed();
      if (now?.god?.asked && !now.sheet.asking && Number.isInteger(face) && face >= 1 && face <= FACES) change(now.sheet, { favouredRoll: face, bonus: null });
      else if (now) draw();
    },
    onFavoured: (choice) => {
      const now = pressed();
      if (now?.god?.hit && (choice === NO_BONUS || now.god.skills.some(({ name, held }) => name === choice && !held))) change(now.sheet, { bonus: choice });
      else if (now) draw();
    },
  };
}

/**
 * A skill as a chip: its name on a button that opens the rule, and the list of
 * chips a player carries.
 *
 * The chip only says which skill was tapped. Opening the rule (a sheet, with
 * the text from the content vault) is the screen's, through wireSkillChips.
 * Which skills a player has, which were gained, and where each came from
 * ("starting", an advancement) is the caller's, taken from src/domain.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames, dataAttributes } from "./markup.mjs";

/**
 * One skill.
 *
 * @param {object} props
 * @param {string} props.name the skill as the rules spell it; never translated
 * @param {boolean} [props.gained] earned by an advancement rather than starting with the player
 * @param {boolean} [props.card] the larger chip, which can say where the skill came from
 * @param {string} [props.source] the small line under the name; drawn on a card only
 */
export function renderSkillChip({ name, gained = false, card = false, source = "" }) {
  if (!name) throw new Error("a skill chip needs a name: it is what opens the rule");
  const className = classNames("g-skill", gained && "g-skill--gained", card && "g-skill--card");
  const origin = card && source ? `<small class="g-skill__source">${escapeHtml(source)}</small>` : "";
  return `<button type="button" class="${className}" aria-haspopup="dialog"${dataAttributes({ skill: name })}>${escapeHtml(name)}${origin}</button>`;
}

/**
 * The chips of one player, wrapping onto as many lines as they need. A player
 * with none gets a word: an empty row would read as a missing section.
 *
 * @param {object} props
 * @param {{name: string, gained?: boolean, source?: string}[]} props.skills
 * @param {boolean} [props.card] every chip is a card
 */
export function renderSkillChips({ skills, card = false }) {
  if (!Array.isArray(skills)) throw new Error("a skill list needs skills: an array, empty when the player has none");
  if (!skills.length) return `<span class="g-skills-none">${escapeHtml(t("ui.skills.none"))}</span>`;
  return `<div class="${classNames("g-skills", card && "g-skills--cards")}">${skills.map((skill) => renderSkillChip({ ...skill, card })).join("")}</div>`;
}

/** A tap anywhere on a chip, its source line included, reports `(name, chip)`. */
export function wireSkillChips(root, onOpen) {
  return delegate(root, "click", "[data-skill]",(event, chip) => onOpen(chip.getAttribute("data-skill"), chip));
}

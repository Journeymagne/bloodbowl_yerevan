/**
 * The sheets the roster opens over itself. A skill's (plan 07a, decision 15): the name as the roster writes it,
 * what the skill is (its category and its type, as the reference panel of a skill says them), the rule from the
 * reference, and whose skill it is and where he got it. The page is the one the shared name→page rule finds
 * (`pageForName`), so «Loner (3+)» opens the rule of «Loner (X+)» under the name the player has.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { pageForName } from "../../ref/catalog.mjs";
import { categoryOf, tagsOf } from "../../ref/skill.mjs";

/** What the skill's sheet is shown by (`#roster-skill`) and what wireSheets reports. */
export const SKILL_SHEET = "roster-skill";

/** "Strength · Active": the category of the Skill Table (a trait's tag), then whether it is used or always there. */
function captionOf(data, page) {
  const { category, type } = tagsOf(page);
  return [categoryOf(data, page) ?? category, type].filter(Boolean).join(" · ");
}

/**
 * The rule of a skill a player has, in a sheet.
 *
 * @param {object} props
 * @param {object} props.data the reference of the page's language (state.data)
 * @param {import("./model.mjs").PlayerLine} props.line the player whose chip was pressed
 * @param {string} props.name the skill as the roster writes it
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-skill")` opens it
 */
export function skillSheetMarkup({ data, line, name }) {
  const page = pageForName(data, name);
  const skill = line.skills.find((item) => item.name === name);
  // The build escapes a page's html (scripts/build-data.mjs); a page without it has its text.
  const rule = page ? `<div class="g-prose">${page.html || `<p>${escapeHtml(page.text ?? "")}</p>`}</div>` : `<p class="g-roster__nopage">${escapeHtml(t("teamRoster.skill.noPage"))}</p>`;
  const from = skill ? `<p class="g-roster__from">${escapeHtml(t("teamRoster.skill.from", { player: line.name, source: t(`teamRoster.source.${skill.source}`) }))}</p>` : "";
  return renderSheet({ id: SKILL_SHEET, title: name, sub: page ? captionOf(data, page) : "", bodyHtml: `${rule}${from}` });
}

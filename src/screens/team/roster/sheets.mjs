/**
 * The sheets the roster opens over itself. A skill's (plan 07a, decision 15): the name as the roster writes it,
 * what the skill is (its category and its type, as the reference panel of a skill says them), the rule from the
 * reference, and whose skill it is and where he got it. The page is the one the shared name→page rule finds
 * (`pageForName`), so «Loner (3+)» opens the rule of «Loner (X+)» under the name the player has.
 *
 * An injury in the match (Task 12, decision 14): the five results of the Casualty Table, a lasting one with the
 * characteristic it lowers, recorded in the match as a row of it, and the standing one taken back by its own −1.
 * The post-match's Players step reads it from the rows; the roster is changed there, not here.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { INJURIES } from "../../../domain/post-match/rules.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderFilterChips } from "../../../ui/filter-chips.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";
import { renderOptionList } from "../../../ui/option-card.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { pageForName } from "../../ref/catalog.mjs";
import { categoryOf, tagsOf } from "../../ref/skill.mjs";
import { matchWords } from "./panel.mjs";

/** What the skill's sheet is shown by (`#roster-skill`) and what wireSheets reports. */
export const SKILL_SHEET = "roster-skill";
/** What the injury's sheet is shown by (`#roster-injury`) and what wireSheets reports. */
export const INJURY_SHEET = "roster-injury";
/** The name its row of characteristics is wired by (wireFilterChips). */
export const INJURY_STAT = "injury-stat";

/** The injuries a match deals: the Casualty Table's results, «none» being none. */
const INJURY_CODES = INJURIES.filter((code) => code !== "none");

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

/** The injury the sheet's choice makes, or null while it is not whole: none chosen, a lasting one without its characteristic. */
export function chosenInjury({ code, stat }) {
  if (!INJURY_CODES.includes(code)) return null;
  if (code !== "lasting") return { code };
  return PLAYER_STATS.includes(stat) ? { code, stat } : null;
}

/** «Which characteristic» a lasting injury lowers, as a row of chips under its caption. */
function statMarkup(stat) {
  const label = t("teamRoster.injury.stat");
  const items = PLAYER_STATS.map((value) => ({ value, label: t(`stats.${value}`) }));
  return `<div class="g-roster__injurystat"><p class="g-roster__injurylabel" aria-hidden="true">${escapeHtml(label)}</p>`
    + `${renderFilterChips({ label, items, selected: stat, data: { chipGroup: INJURY_STAT } })}</div>`;
}

/**
 * A button of the sheet's foot. `disabled` while it has nothing to send: busy with a row of his, or (the record)
 * nothing whole chosen. Closed with the match's taps (`reason`), it says why as the steppers behind the sheet do —
 * `aria-disabled` and the reason as its title, in the look of a closed control (roster.css) — and stays in reach: a
 * press says it again and sends nothing (injury.mjs).
 */
function footButton({ label, kind, step, disabled, reason }) {
  if (disabled || !reason) return renderButton({ label, kind, disabled, data: { injuryStep: step } });
  return `<button type="button" class="g-btn g-btn--${kind} g-roster__closed" aria-disabled="true" title="${escapeHtml(reason)}"${dataAttributes({ injuryStep: step })}>`
    + `${escapeHtml(label)}</button>`;
}

/**
 * An injury of the match for one player who plays it.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player; `line.injury` is the one that stands, which «Remove the record» takes back
 * @param {{kind: "match", round: number|null}} props.mode the match on
 * @param {{code: string, stat: string}} props.choice what is chosen in the sheet ("" for nothing yet)
 * @param {boolean} [props.busy] an injury of his is on its way: neither button sends another until it has answered (R14)
 * @param {string} [props.reason] why no injury of his can be recorded just now, as the match's taps are closed (`injuryClosed`); "" when one can
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-injury")` opens it
 */
export function injurySheetMarkup({ line, mode, choice, busy = false, reason = "" }) {
  const options = INJURY_CODES.map((code) => ({ value: code, title: t(`teamRoster.injury.${code}`), sub: t(`teamRoster.injuryCaption.${code}`), radio: true }));
  const list = renderOptionList({ label: t("teamRoster.injury.choose"), options, selected: choice.code });
  const stat = choice.code === "lasting" ? statMarkup(choice.stat) : "";
  const note = `<p class="g-roster__injurynote">${escapeHtml(t("teamRoster.injury.note", { match: matchWords(mode) }))}</p>`;
  const remove = line.injury ? footButton({ label: t("teamRoster.injury.remove"), kind: "danger-quiet", step: -1, disabled: busy, reason }) : "";
  const record = footButton({ label: t("teamRoster.injury.record"), kind: "primary", step: 1, disabled: busy || (!reason && !chosenInjury(choice)), reason });
  return renderSheet({
    id: INJURY_SHEET,
    title: t("teamRoster.injury.title"),
    sub: t("teamRoster.injury.who", { number: line.number, name: line.name, position: line.position }),
    bodyHtml: `${list}${stat}${note}`,
    footStartHtml: remove,
    footHtml: record,
  });
}

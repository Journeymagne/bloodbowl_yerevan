/**
 * The sheets the roster opens over itself. A skill's (plan 07a, decision 15): the name as the roster writes it,
 * what the skill is (its category and its type, as the reference panel of a skill says them), the rule from the
 * reference, and whose skill it is and where he got it. The page is the one the shared name→page rule finds
 * (`pageForName`), so «Loner (3+)» opens the rule of «Loner (X+)» under the name the player has.
 *
 * An injury in the match (Task 12, decision 14): the five results of the Casualty Table, a lasting one with the
 * characteristic it lowers, recorded in the match as a row of it, and the standing one taken back by its own −1.
 * The post-match's Players step reads it from the rows; the roster is changed there, not here.
 *
 * Stage 07b's sheets — a missed match's reasons (mark-sheet.mjs) and the undo of a death — stage 07c's — the hire
 * cart (hire-sheet.mjs) and a player's sale — and stage 07d's player edit and the undo of his last advancement
 * (player-sheets.mjs), his advancement (advance-sheet.mjs) and his fix by hand (fix.mjs) are drawn by their own modules; what they share with the injury's is here: the ids the screen
 * shows each by, the row of characteristics and the foot's button. So is the id of the admin's sheet of a fallen player added
 * afterwards (stage 12, admin/team-sheets.mjs).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { INJURIES } from "../../../domain/post-match/rules.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderFilterChips } from "../../../ui/filter-chips.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderOptionList } from "../../../ui/option-card.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { gettingEvenDetails } from "../../../ui/getting-even.mjs";
import { pageForName } from "../../ref/catalog.mjs";
import { proseMarkup } from "../../ref/prose.mjs";
import { categoryOf, tagsOf } from "../../ref/skill.mjs";
import { matchWords, skillSourceOf } from "./panel.mjs";

/** What the skill's sheet is shown by (`#roster-skill`) and what wireSheets reports. */
export const SKILL_SHEET = "roster-skill";
/** What the injury's sheet is shown by (`#roster-injury`) and what wireSheets reports. */
export const INJURY_SHEET = "roster-injury";
/** The name its row of characteristics is wired by (wireFilterChips). */
export const INJURY_STAT = "injury-stat";
/** What the sheet of a missed match's reasons is shown by (`#roster-mark`) and what wireSheets reports. */
export const MARK_SHEET = "roster-mark";
/** What the sheet that undoes a death is shown by (`#roster-undo`) and what wireSheets reports. */
export const UNDO_SHEET = "roster-undo";
/** The name the mark's row of characteristics is wired by: a row of its own, so that neither sheet hears the other's (wireFilterChips). */
export const MARK_STAT = "mark-stat";
/** What the hire cart is shown by (`#roster-hire`, stage 07c) and what wireSheets reports. */
export const HIRE_SHEET = "roster-hire";
/** What the sheet that sells a player, or cancels his purchase, is shown by (`#roster-sell`, stage 07c) and what wireSheets reports. */
export const SELL_SHEET = "roster-sell";
/** What a player's edit — his number, name and captaincy — is shown by (`#player-edit`, stage 07d) and what wireSheets reports. */
export const EDIT_SHEET = "player-edit";
/** What a player's advancement is shown by (`#player-advance`, stage 07d) and what wireSheets reports, «Back» too. */
export const ADVANCE_SHEET = "player-advance";
/** What the undo of a player's last advancement is shown by (`#player-unadvance`, stage 07d) and what wireSheets reports. */
export const UNADVANCE_SHEET = "player-unadvance";
/** What a player's fix by hand is shown by (`#player-fix`, stage 07d) and what wireSheets reports. */
export const FIX_SHEET = "player-fix";
/** The frame every sheet of a player's wears (stage 07d: his edit, the undo, his advancement, his fix; player-sheets.css). */
export const PLAYER_FRAME = "g-player-sheet";
/** What the admin's sheet of a fallen player added afterwards is shown by (`#admin-fallen`, stage 12; admin/team-sheets.mjs). */
export const ADMIN_FALLEN_SHEET = "admin-fallen";

/** The id of each kind of sheet the visit holds (index.mjs's `visit.sheet.kind`). */
const SHEET_IDS = Object.freeze({
  skill: SKILL_SHEET, injury: INJURY_SHEET, mark: MARK_SHEET, undo: UNDO_SHEET, hire: HIRE_SHEET, sell: SELL_SHEET, edit: EDIT_SHEET, advance: ADVANCE_SHEET,
  unadvance: UNADVANCE_SHEET, fix: FIX_SHEET, adminFallen: ADMIN_FALLEN_SHEET,
});

/** The id a sheet of `kind` is shown by, which wireSheets reports when it is closed; "" for a kind there is none of. */
export function sheetIdOf(kind) {
  return SHEET_IDS[kind] ?? "";
}

/** The injuries a match deals: the Casualty Table's results, «none» being none. */
const INJURY_CODES = INJURIES.filter((code) => code !== "none");

/** "Strength · Active": the category of the Skill Table (a trait's tag), then whether it is used or always there. */
function captionOf(data, page) {
  const { category, type } = tagsOf(page);
  return [categoryOf(data, page) ?? category, type].filter(Boolean).join(" · ");
}

/**
 * The reference's page of a skill as the roster writes it: «Loner (3+)» is «Loner (X+)»'s (`pageForName`), a Hatred of
 * a keyword the one Hatred (X) page; null for a skill the reference has no page for.
 * @param {object} data the reference of the page's language (state.data) @param {string} name
 */
export function skillPageOf(data, name) {
  return pageForName(data, name) ?? (/^Hatred \(.+\)$/.test(name) ? pageForName(data, "Hatred (X)") : null);
}

/** A skill page's rule as the vault's prose: the build escapes a page's html (scripts/build-data.mjs); a page without it has its text. */
export const skillRuleMarkup = (page) => proseMarkup(page.html || `<p>${escapeHtml(page.text ?? "")}</p>`);

/**
 * The tag's own line: whose skill it is and how he came by it — «Bors · Advancement 1 · Random primary» for a skill an
 * advancement gave (the advancement said once, in the tag), else as the panel's card says it (`skillSourceOf`,
 * short): «Grom · Starting», «Kor · Captain's».
 */
function fromWords(line, skill) {
  const source = skillSourceOf(line, skill, { short: true });
  const at = skill.advancement ?? null;
  if (at === null || !line.advancements[at]) return t("teamRoster.skill.from", { player: line.name, source });
  return t("teamRoster.skill.fromAdvancement", { player: line.name, level: at + 1, source });
}

/**
 * The rule of a skill a player has, in a sheet, and under it a tag of whose skill it is (`fromWords`) — with, for a skill an
 * advancement gave, how it was rolled and what the site's dice showed as small lines in it (roll-view.mjs's
 * `rollNotesMarkup`, stage 07d's decision 19).
 *
 * @param {object} props
 * @param {object} props.data the reference of the page's language (state.data)
 * @param {import("./model.mjs").PlayerLine} props.line the player whose chip was pressed
 * @param {string} props.name the skill as the roster writes it
 * @param {string} [props.notesHtml] markup of `rollNotesMarkup()`, "" for none
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-skill")` opens it
 */
export function skillSheetMarkup({ data, line, name, notesHtml = "" }) {
  const page = skillPageOf(data, name);
  const skill = line.skills.find((item) => item.name === name);
  const rule = page ? skillRuleMarkup(page) : `<p class="g-roster__nopage">${escapeHtml(t("teamRoster.skill.noPage"))}</p>`;
  // The box is coloured as the chip that opened it (skill-chip.css): a gained skill's green (StatsSkill.html, fidelity
  // F8); the captain's gold; any other white in the ring.
  const captain = skill?.source === "captain";
  const from = skill
    ? `<div class="${classNames("g-roster__from", skill.gained && "g-roster__from--gained", captain && "g-roster__from--captain")}">`
      + `<span class="g-roster__fromline">${escapeHtml(fromWords(line, skill))}</span>${notesHtml}</div>`
    : "";
  const origin = skill?.origin ? gettingEvenDetails({ ...skill.origin, attacker: { ...skill.origin.attacker, keywords: [skill.origin.keyword] } }) : '';
  return renderSheet({ id: SKILL_SHEET, title: name, sub: page ? captionOf(data, page) : "", bodyHtml: `${rule}${from}${origin}` });
}

/** The injury the sheet's choice makes, or null while it is not whole: none chosen, a lasting one without its characteristic. */
export function chosenInjury({ code, stat }) {
  if (!INJURY_CODES.includes(code)) return null;
  if (code !== "lasting") return { code };
  return PLAYER_STATS.includes(stat) ? { code, stat } : null;
}

/**
 * The characteristic a lasting injury lowers, as a row of chips under its caption: the injury's, and a missed match's.
 *
 * @param {object} props
 * @param {string} props.stat the one chosen, "" for none yet
 * @param {string} props.group the name the row is wired by (`INJURY_STAT`, `MARK_STAT`)
 * @param {string} props.label the caption, which names the row for a screen reader too
 * @param {boolean} [props.plain] the caption as a sentence, not in capitals (a missed match's, StatsMng.html)
 */
export function statChipsMarkup({ stat, group, label, plain = false }) {
  const items = PLAYER_STATS.map((value) => ({ value, label: t(`stats.${value}`) }));
  return `<div class="g-roster__injurystat"><p class="g-roster__injurylabel${plain ? " g-roster__injurylabel--plain" : ""}" aria-hidden="true">${escapeHtml(label)}</p>`
    + `${renderFilterChips({ label, items, selected: stat, data: { chipGroup: group } })}</div>`;
}

/**
 * A button of a sheet's foot, `data` naming what it does. `busy` while a write of his is on its way: it says so
 * (`aria-busy`, `aria-disabled`) but is not `disabled`, which would take the focus from it in Chrome (button.mjs) —
 * the screen refuses a press meanwhile (injury.mjs, marks.mjs). `disabled` while it has nothing to send: nothing whole
 * chosen. Closed (`reason`: the match's taps, the screen's lock), it says why as the controls behind the sheet do —
 * `aria-disabled` and the reason as its title, in the look of a closed control (roster.css) — and stays in reach: a
 * press says it again and sends nothing.
 *
 * @param {{label: string, kind: string, data: object, disabled?: boolean, busy?: boolean, reason?: string}} props
 */
export function footButton({ label, kind, data, disabled = false, busy = false, reason = "" }) {
  if (busy) return renderButton({ label, kind, busy, data });
  if (disabled || !reason) return renderButton({ label, kind, disabled, data });
  return `<button type="button" class="g-btn g-btn--${kind} g-roster__closed" aria-disabled="true" title="${escapeHtml(reason)}"${dataAttributes(data)}>`
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
export function injurySheetMarkup({ line, mode, choice, busy = false, reason = "", even }) {
  const options = INJURY_CODES.map((code) => ({ value: code, title: t(`teamRoster.injury.${code}`), sub: t(`teamRoster.injuryCaption.${code}`), radio: true }));
  const list = renderOptionList({ label: t("teamRoster.injury.choose"), options, selected: choice.code });
  const stat = choice.code === "lasting" ? statChipsMarkup({ stat: choice.stat, group: INJURY_STAT, label: t("teamRoster.injury.stat") }) : "";
  const note = `<p class="g-roster__injurynote">${escapeHtml(t("teamRoster.injury.note", { match: matchWords(mode) }))}</p>`;
  const remove = line.injury ? footButton({ label: t("teamRoster.injury.remove"), kind: "danger-quiet", data: { injuryStep: -1 }, busy, reason }) : "";
  const record = footButton({ label: t("teamRoster.injury.record"), kind: "primary", data: { injuryStep: 1 }, busy, disabled: !reason && !chosenInjury(choice), reason });
  return renderSheet({
    id: INJURY_SHEET,
    title: t("teamRoster.injury.title"),
    sub: t("teamRoster.injury.who", { number: line.number, name: line.name, position: line.position }),
    bodyHtml: `${list}${stat}${note}${even?.markup() ?? ''}`,
    footStartHtml: remove,
    footHtml: record,
  });
}

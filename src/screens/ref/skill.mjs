/**
 * The panel of a skill or a trait (`#/skills/:slug`, `#/traits/:slug`), drawn beside its list: the
 * letter of its category on the category's colour, its name and what it is, the rule as the vault
 * has it, and — for a skill — the face of the Skill Table's D16 that rolls it and the elite combination
 * it is half of. A coach with an active team also sees which of its players have the skill, by number.
 *
 * The category and the face are what the vault says; where the page's tags and the Skill Table
 * disagree, each is drawn as it is written.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { eliteComboCost, eliteSkillCombos } from "../../domain/league-rules.mjs";
import { canonicalSkillName, skillNamesForPlayer } from "../../domain/roster/players.mjs";
import { rowsForTeam } from "../../domain/roster/values.mjs";
import { renderKeyValueRow } from "../../ui/list-row.mjs";
import { hasNumericParameter, nameMatchesTitle, withoutParameter } from "./catalog.mjs";

/** The categories that have a colour of their own; any other tag is drawn as a trait is. */
const TONES = new Set(["agility", "devious", "general", "mutation", "passing", "strength"]);
const TYPES = new Set(["Active", "Passive"]);

/** The faces of the die the Skill Table is thrown on. */
const SKILL_TABLE_SIDES = 16;

/** What a skill or a trait is, as its tags have it: the category, and whether it is used or always there. */
export function tagsOf(page) {
  const tags = page.tags ?? [];
  return { category: tags.find((tag) => !TYPES.has(tag)) ?? "", type: tags.find((tag) => TYPES.has(tag)) ?? "" };
}

/** The category a skill belongs to: the first of its tags that is a category of the Skill Table. A trait has none. */
export function categoryOf(data, page) {
  const categories = new Set((data.skillGroups ?? []).map(({ category }) => category));
  return (page.tags ?? []).find((tag) => categories.has(tag)) ?? null;
}

/** The letter of a category on its colour; a trait, or a tag with no colour of its own, wears a dot. */
export function badgeMarkup(category, { large = false } = {}) {
  const tone = String(category ?? "").toLowerCase();
  const known = TONES.has(tone);
  return `<span class="g-ref-badge g-ref-badge--${known ? tone : "trait"}${large ? " g-ref-badge--lg" : ""}" aria-hidden="true">${escapeHtml(known ? tone[0].toUpperCase() : "•")}</span>`;
}

/**
 * Where a skill stands on the Skill Table: its column, and the face of the D16 that rolls it (a column
 * fills faces 1 to N, as bodies.mjs has it). A skill with a parameter is found under its name
 * (`Mighty Blow (+1)` is `Mighty Blow`); a trait, or a skill the table leaves out, is not on it.
 *
 * @returns {{category: string, face: number, sides: number}|null}
 */
export function skillRoll(data, title) {
  const wanted = canonicalSkillName(title);
  for (const group of data.skillGroups ?? []) {
    const index = group.skills.findIndex((name) => canonicalSkillName(name) === wanted);
    if (index >= 0) return { category: group.category, face: index + 1, sides: SKILL_TABLE_SIDES };
  }
  return null;
}

/**
 * The elite combination a skill is half of, as the league's rules have it (`eliteSkillCombos`, and the
 * surcharge `eliteComboCost` — the number, not the roster's function of the same name): the skills that
 * complete it and what the pair adds to a player's value. A skill with a parameter is found under its name
 * (`Mighty Blow (+1)` is the pair's `Mighty Blow`), as on the Skill Table; a skill of no pair has none.
 *
 * @returns {{partners: string[], surcharge: number}|null}
 */
export function eliteOf(title) {
  const wanted = canonicalSkillName(title ?? "");
  const partners = eliteSkillCombos.flatMap((pair) => (pair.some((name) => canonicalSkillName(name) === wanted)
    ? pair.filter((name) => canonicalSkillName(name) !== wanted)
    : []));
  return wanted && partners.length ? { partners, surcharge: eliteComboCost } : null;
}

/**
 * Whether a player holds the skill a page is about: a name of theirs that the page stands for (catalog.mjs
 * `nameMatchesTitle`, the rule that links a roster's skills to their pages), so that the panel and the link
 * agree. A page with a number in its title (`Mighty Blow (+1)` and `(+2)` are skills of their own) is held by
 * the players who have exactly that (R3); any other page (a plain `Mighty Blow`) also by whoever has it under a parameter.
 */
function holds(row, player, title) {
  const numbered = hasNumericParameter(title);
  return skillNamesForPlayer(row, player).some((name) => nameMatchesTitle(name, title) || (!numbered && nameMatchesTitle(withoutParameter(name), title)));
}

/**
 * The players of a team who have the skill, in the roster's order: from their position, their
 * advancements, the skills they favour and the captaincy (`skillNamesForPlayer`). No team, or a team whose
 * race has no page, has none; a player whose row the race no longer has is left out.
 *
 * @param {{team: object|null, teamPage: object|null, title: string}} props `team` the coach's team as the server has it, `teamPage` the page of its race
 * @returns {{number: string, name: string, position: string}[]}
 */
export function skillHolders({ team, teamPage, title }) {
  if (!team || !teamPage) return [];
  const rows = rowsForTeam(teamPage);
  return (team.roster?.players ?? []).flatMap((player) => {
    const row = rows[player.rowIndex];
    if (!row || !holds(row, player, title)) return [];
    return [{ number: String(player.number ?? ""), name: String(player.name ?? ""), position: String(row.position ?? "") }];
  });
}

function rollValue(roll) {
  return roll ? t("ref.skill.rollValue", { category: roll.category, face: roll.face }) : t("ref.skill.notInTable");
}

function eliteValue(elite) {
  return elite ? t("ref.skill.eliteWith", { skills: elite.partners.join(", "), price: formatMoney(elite.surcharge) }) : t("ref.skill.eliteNone");
}

/** A skill's lines under its rule (DeskRef): the random roll, then the elite combination. A trait has neither. */
function factsMarkup(data, page) {
  if (page.kind !== "skill") return "";
  return `<div class="g-skill-detail__facts">${renderKeyValueRow({ label: t("ref.skill.roll"), value: rollValue(skillRoll(data, page.title)) })}`
    + `${renderKeyValueRow({ label: t("ref.skill.elite"), value: eliteValue(eliteOf(page.title)) })}</div>`;
}

function holderRow({ number, name, position }) {
  // The badge, then the name with the position under it; the source order is the reading order: number, name, position.
  return `<li class="g-skill-detail__holder"><span class="g-skill-detail__num">${escapeHtml(number)}</span>`
    + `<span class="g-skill-detail__text"><span class="g-skill-detail__who">${escapeHtml(name)}</span>`
    + `<span class="g-skill-detail__pos">${escapeHtml(position)}</span></span></li>`;
}

function oursMarkup(holders) {
  const body = holders.length
    ? `<ul class="g-skill-detail__holders">${holders.map(holderRow).join("")}</ul>`
    : `<p class="g-skill-detail__none">${escapeHtml(t("ref.skill.noneOurs"))}</p>`;
  return `<section class="g-skill-detail__ours"><h2 class="g-skill-detail__ours-title">${escapeHtml(t("ref.skill.ours"))}</h2>${body}</section>`;
}

/**
 * A skill or a trait for the panel.
 *
 * @param {object} props
 * @param {object} props.data the content vault of the language
 * @param {object} props.page the skill or the trait
 * @param {object|null} [props.team] the coach's active team; without one the panel has no block for it
 * @param {object|null} [props.teamPage] the page of the team's race, whose rows say what each position has
 */
export function skillDetailMarkup({ data, page, team = null, teamPage = null }) {
  const category = categoryOf(data, page);
  const { category: tagged, type } = tagsOf(page);
  const caption = [category ?? tagged, type].filter(Boolean).join(" · ");
  const rule = page.html || `<p>${escapeHtml(page.text ?? "")}</p>`;
  return `<article class="g-skill-detail" data-page="${escapeHtml(page.slug ?? "")}"><header class="g-skill-detail__head">${badgeMarkup(category, { large: true })}`
    + `<div class="g-skill-detail__title"><h1 class="g-skill-detail__name">${escapeHtml(page.title)}</h1>`
    + `<p class="g-skill-detail__caption">${escapeHtml(caption)}</p></div></header>`
    + `<div class="g-prose">${rule}</div>${factsMarkup(data, page)}`
    + `${team ? oursMarkup(skillHolders({ team, teamPage, title: page.title })) : ""}</article>`;
}

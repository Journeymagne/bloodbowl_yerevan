/**
 * The panel of a skill or a trait (`#/skills/:slug`, `#/traits/:slug`), drawn beside its list: the
 * letter of its category on the category's colour, its name and what it is, the rule as the vault
 * has it, and — for a skill — the face of the Skill Table's D16 that rolls it. A coach with an active
 * team also sees which of its players have the skill, by number.
 *
 * The category and the face are what the vault says; where the page's tags and the Skill Table
 * disagree, each is drawn as it is written.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { canonicalSkillName, heldSkillKeys } from "../../domain/roster/players.mjs";
import { ruleLookupKey } from "../../domain/roster/team-rules.mjs";
import { rowsForTeam } from "../../domain/roster/values.mjs";
import { renderKeyValueRow } from "../../ui/list-row.mjs";

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
 * A skill's name as the pages and a roster spell it alike: with no parameter (`Loner (4+)` and
 * `Animosity (All)` are the pages `Loner (X+)` and `Animosity (X)`), and with no case, space or hyphen
 * (`Bone Head` is `Bonehead`, `Throw Team-mate` is `Throw Team-Mate`), as catalog.mjs `pageForName` reads them.
 */
const skillKey = (name) => ruleLookupKey(String(name).replace(/\s*\([^)]*\)\s*$/, ""));

/**
 * The players of a team who have the skill, in the roster's order: from their position, their
 * advancements, the skills they favour and the captaincy (`heldSkillKeys`). No team, or a team whose
 * race has no page, has none; a player whose row the race no longer has is left out.
 *
 * @param {{team: object|null, teamPage: object|null, title: string}} props `team` the coach's team as the server has it, `teamPage` the page of its race
 * @returns {{number: string, name: string, position: string}[]}
 */
export function skillHolders({ team, teamPage, title }) {
  if (!team || !teamPage) return [];
  const rows = rowsForTeam(teamPage);
  const wanted = skillKey(title);
  return (team.roster?.players ?? []).flatMap((player) => {
    const row = rows[player.rowIndex];
    if (!row || ![...heldSkillKeys(row, player)].some((name) => skillKey(name) === wanted)) return [];
    return [{ number: String(player.number ?? ""), name: String(player.name ?? ""), position: String(row.position ?? "") }];
  });
}

function rollValue(roll) {
  return roll ? t("ref.skill.rollValue", { category: roll.category, face: roll.face }) : t("ref.skill.notInTable");
}

function holderRow({ number, name, position }) {
  return `<li class="g-skill-detail__holder"><span class="g-skill-detail__num">${escapeHtml(number)}</span>`
    + `<span class="g-skill-detail__who">${escapeHtml(name)}</span><span class="g-skill-detail__pos">${escapeHtml(position)}</span></li>`;
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
  const roll = page.kind === "skill" ? renderKeyValueRow({ label: t("ref.skill.roll"), value: rollValue(skillRoll(data, page.title)) }) : "";
  const rule = page.html || `<p>${escapeHtml(page.text ?? "")}</p>`;
  return `<article class="g-skill-detail"><header class="g-skill-detail__head">${badgeMarkup(category, { large: true })}`
    + `<div class="g-skill-detail__title"><h1 class="g-skill-detail__name">${escapeHtml(page.title)}</h1>`
    + `<p class="g-skill-detail__caption">${escapeHtml(caption)}</p></div></header>`
    + `<div class="g-prose">${rule}</div>${roll}`
    + `${team ? oursMarkup(skillHolders({ team, teamPage, title: page.title })) : ""}</article>`;
}

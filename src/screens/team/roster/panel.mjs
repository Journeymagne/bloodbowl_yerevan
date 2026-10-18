/**
 * What the roster says of one player beyond his row: the row opened on a phone, and the panel beside the table
 * on a desk (plan 07a, decisions 20 and 21). Both lead to the player's own page — the 2.x editor until stage
 * 07d — for what the roster does not do yet: advancements, the name, the number, the captaincy.
 *
 * Until the counters come (Task 10) the row and the panel show the career's numbers as text. A player the roster
 * stores no id for (`line.id === ""`) has no page to lead to: an empty id would make the roster's own address.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamPlayerUrl } from "../../../core/routes.mjs";
import { advancementRanks } from "../../../domain/league-rules.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { icon } from "../../../ui/icons.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderProgressDots } from "../../../ui/progress-dots.mjs";
import { renderSkillChips } from "../../../ui/skill-chip.mjs";
import { renderStatStrip } from "../../../ui/stat-strip.mjs";
import { counterSlots } from "./model.mjs";

/** The player's page, or "" for one with no stored id. */
const profileUrl = (line, screen) => (line.id ? teamPlayerUrl(screen.team.id, line.id) : "");

/**
 * A player's skills as chips: in his row, or (`card`) as the panel's cards, each saying where it came from.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{card?: boolean}} [options]
 */
export function skillChipsMarkup(line, { card = false } = {}) {
  const skills = line.skills.map(({ name, gained, source }) => ({ name, gained, source: card ? t(`teamRoster.source.${source}`) : "" }));
  return renderSkillChips({ skills, card });
}

/** The counters of the race, each with the career's number: the abbreviation for the eye, the name for a screen reader. */
function tallyMarkup(line, race) {
  const { main, extra } = counterSlots(race);
  const items = [...main, ...extra].map(({ key }) => `<div class="g-roster__tallyitem"><dt class="g-roster__tallyk">`
    + `<span aria-hidden="true">${escapeHtml(t(`teamRoster.counter.${key}`))}</span><span class="g-sr-only">${escapeHtml(t(`teamRoster.counterName.${key}`))}</span></dt>`
    + `<dd class="g-roster__tallyv">${escapeHtml(line.career[key] ?? 0)}</dd></div>`);
  return `<dl class="g-roster__tally">${items.join("")}</dl>`;
}

/**
 * The row of a player opened on a phone: his counters, and the way to his page.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function rowPanelMarkup(line, screen) {
  const href = profileUrl(line, screen);
  const profile = href ? renderButton({ label: t("teamRoster.profile"), kind: "dark", block: true, href }) : "";
  return `<div class="g-roster__rowpanel">${tallyMarkup(line, screen.race)}${profile}</div>`;
}

/** The badge, the name, the position with what he is worth, and the pencil to his page. */
function headMarkup(line, href) {
  const pencil = href
    ? `<a class="g-icon-btn g-roster__edit" href="${escapeHtml(href)}" aria-label="${escapeHtml(t("teamRoster.edit", { name: line.name }))}">${icon("pencil", 18)}</a>`
    : "";
  return `<div class="g-roster__phead">${renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain, large: true })}`
    + `<div class="g-roster__pwho"><h2 class="g-roster__pname">${escapeHtml(line.name)}</h2>`
    + `<p class="g-roster__pline">${escapeHtml(t("teamRoster.value", { position: line.position, value: formatMoney(line.value) }))}</p></div>${pencil}</div>`;
}

/** The five characteristics, a changed one said in words as well as in colour. */
function statsMarkup(line) {
  const changed = (change) => PLAYER_STATS.filter((stat) => line.stats[stat].change === change);
  return renderStatStrip({ values: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, line.stats[stat].text])), improved: changed("up"), lowered: changed("down") });
}

/** His SPP: what he may spend, what he has earned and spent, his advancements, and the cheapest next one. */
function sppMarkup(line, href) {
  const cheapest = line.cheapest === null ? t("teamRoster.maxed") : t("teamRoster.cheapest", { spp: line.cheapest });
  return `<div class="g-roster__spp"><div class="g-roster__spptop">`
    + `<p class="g-roster__avail"><span class="g-roster__availn">${escapeHtml(line.available)}</span> <span class="g-roster__availl">${escapeHtml(t("teamRoster.available"))}</span></p>`
    + `<p class="g-roster__ledger"><span class="g-roster__ledgerline">${escapeHtml(t("teamRoster.earned", { spp: line.earned }))}</span>`
    + `<span class="g-roster__ledgerline">${escapeHtml(t("teamRoster.spent", { spp: line.spent }))}</span></p></div>`
    + renderProgressDots({ total: advancementRanks.length, done: line.level, label: t("teamRoster.advancements") })
    + (href ? renderButton({ label: t("teamRoster.advance"), kind: "primary", block: true, href }) : "")
    + `<p class="g-roster__cheapest">${escapeHtml(cheapest)}</p></div>`;
}

/** A list of skill categories; a position with none in an access has a dash. */
const categories = (names) => (names.length ? names.join(", ") : "–");

/** His skills as cards with where each came from, and the categories he may take them from. */
function skillsMarkup(line) {
  const access = t("teamRoster.access", { primary: categories(line.primary), secondary: categories(line.secondary) });
  return `<section class="g-roster__pblock"><h3 class="g-roster__ptitle">${escapeHtml(t("teamRoster.skills"))}</h3>`
    + `${skillChipsMarkup(line, { card: true })}<p class="g-roster__access">${escapeHtml(access)}</p></section>`;
}

/**
 * The panel beside the table on a desk: the player the coach chose, or the table's first.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function sidePanelMarkup(line, screen) {
  const href = profileUrl(line, screen);
  const next = t("teamRoster.nextMatch", { state: line.skip ? t("teamRoster.sits") : t("teamRoster.plays") });
  return `${headMarkup(line, href)}${statsMarkup(line)}${tallyMarkup(line, screen.race)}${sppMarkup(line, href)}${skillsMarkup(line)}`
    + `<p class="g-roster__next">${escapeHtml(next)}</p>`;
}

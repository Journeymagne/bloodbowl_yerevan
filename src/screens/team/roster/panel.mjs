/**
 * What the roster says of one player beyond his row: the row opened on a phone, and the panel beside the table
 * on a desk (plan 07a, decisions 20 and 21). Both lead to the player's own page — the 2.x editor until stage
 * 07d — for what the roster does not do yet: advancements, the name, the number, the captaincy.
 *
 * Both hold his SPP counters with − and + (Task 10): outside a match a step is a save of the roster (save.mjs), and
 * the count is the career. A player the roster stores no id for (`line.id === ""`) has no page to lead to — an empty
 * id would make the roster's own address — and no save can name him, so his counters are closed.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamPlayerUrl } from "../../../core/routes.mjs";
import { advancementRanks } from "../../../domain/league-rules.mjs";
import { MAX_SPP_COUNTER } from "../../../domain/roster/validate.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderActionStepper } from "../../../ui/action-stepper.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderProgressDots } from "../../../ui/progress-dots.mjs";
import { renderSkillChips } from "../../../ui/skill-chip.mjs";
import { renderStatStrip } from "../../../ui/stat-strip.mjs";
import { counterSlots, stepRule } from "./model.mjs";

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

/**
 * What keeps a step of one counter from being taken, as the stepper is told it: the minus where `stepRule` stops
 * it; a refused plus at the most a roster takes, which save.mjs refuses without a request (Carry T6), said in the
 * words of the server's own refusal; every button closed while the screen's lock stands, or for a player no save
 * can name. The reasons of a match (the MVP, a player who sits it out) are the match's taps' (Task 11).
 */
function stepsOf(line, key, screen) {
  const rule = stepRule(line, key, { mode: screen.mode, outside: screen.memory.outside });
  const full = rule.via === "roster" && line.blob[key] >= MAX_SPP_COUNTER;
  return {
    decDisabled: rule.decDisabled,
    incBlockedReason: full ? t("validation.SPP_OUT_OF_RANGE", { player: line.name, counter: t(`teamRoster.counter.${key}`) }) : "",
    lockedReason: screen.lock || (line.id ? "" : t("teamRoster.noId")),
  };
}

/**
 * The player's SPP counters with − and +, each with what one is worth to his race and the career's count. A phone
 * lays the six main ones out two to a row and the narrow ones under them; a desk's panel has them all as narrow
 * tiles. The cell carries the player's id, which the save names him by.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 * @param {{desk?: boolean}} [options]
 * @returns {string}
 */
export function countersMarkup(line, screen, { desk = false } = {}) {
  const { main, extra } = counterSlots(screen.race);
  const cells = (slots, compact) => slots.map(({ key, spp }) => renderActionStepper({
    key, label: t(`teamRoster.counter.${key}`), name: t(`teamRoster.counterName.${key}`), spp, value: line.career[key] ?? 0, player: line.name,
    compact, data: { player: line.id }, ...stepsOf(line, key, screen),
  })).join("");
  if (desk) return `<div class="g-roster__tiles">${cells([...main, ...extra], true)}</div>`;
  return `<div class="g-roster__counters">${cells(main, false)}</div><div class="g-roster__extra">${cells(extra, true)}</div>`;
}

/** What the coach's edits have moved his SPP since the screen opened: «+3 SPP», or none yet. */
function sessionMarkup(line) {
  const moved = line.sessionSpp;
  const sum = moved ? t("teamRoster.sppDelta", { delta: `${moved > 0 ? "+" : "−"}${Math.abs(moved)}` }) : t("teamRoster.noChanges");
  return `<span class="${classNames("g-roster__sppdelta", !moved && "g-roster__sppdelta--none")}">${escapeHtml(sum)}</span>`;
}

/**
 * The row of a player opened on a phone: his SPP and what the edits have moved it, his counters, and the way to his page.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function rowPanelMarkup(line, screen) {
  const href = profileUrl(line, screen);
  const profile = href ? renderButton({ label: t("teamRoster.profile"), kind: "dark", block: true, href }) : "";
  const spp = `<div class="g-roster__sppline"><span class="g-roster__sppctx">${escapeHtml(t("teamRoster.sppLine", { spp: line.earned }))}</span>${sessionMarkup(line)}</div>`;
  return `<div class="g-roster__rowpanel">${spp}${countersMarkup(line, screen)}${profile}</div>`;
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

/** The panel's block of counters, «SPP · manual edit», with what the edits have moved his SPP at the right (plan 07a, owner's question 2). */
function manualMarkup(line, screen) {
  return `<section class="g-roster__manual"><div class="g-roster__sppline"><h3 class="g-roster__manualtitle">${escapeHtml(t("teamRoster.manual"))}</h3>`
    + `${sessionMarkup(line)}</div>${countersMarkup(line, screen, { desk: true })}</section>`;
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
  return `${headMarkup(line, href)}${statsMarkup(line)}${manualMarkup(line, screen)}${sppMarkup(line, href)}${skillsMarkup(line)}`
    + `<p class="g-roster__next">${escapeHtml(next)}</p>`;
}

/**
 * What the roster says of one player beyond his row: the row opened on a phone, and the panel beside the table
 * on a desk (plan 07a, decisions 20 and 21). Both lead to the player's own page — the 2.x editor until stage
 * 07d — for what the roster does not do yet: advancements, the name, the number, the captaincy.
 *
 * Both hold his SPP counters with − and + (Task 10): outside a match a step is a save of the roster (save.mjs), and
 * the count is the career. A player the roster stores no id for (`line.id === ""`) has no page to lead to — an empty
 * id would make the roster's own address — and no save can name him, so his counters are closed.
 *
 * During a match (Task 11, decision 13) a step is a record of the match, and the count says beside it what the
 * match has added; the switch «Edit outside the match» makes it an edit of the career instead. The way to his page
 * is closed until the post-match: an advancement there would change the roster the match's finish checks. A player
 * who plays the match has «Injury in the match…» under all that (Task 12, decision 14), closed with the match's taps.
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
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderProgressDots } from "../../../ui/progress-dots.mjs";
import { renderSkillChips } from "../../../ui/skill-chip.mjs";
import { renderStatStrip } from "../../../ui/stat-strip.mjs";
import { counterSlots, stepRule } from "./model.mjs";

/** The player's page, or "" for one with no stored id. */
const profileUrl = (line, screen) => (line.id ? teamPlayerUrl(screen.team.id, line.id) : "");

/** The match on, in the words a line about it uses: «round 3», or «friendly» for a match that has no round. */
export function matchWords(mode) {
  return mode.round === null || mode.round === undefined ? t("teamRoster.match.friendly") : t("teamRoster.match.round", { round: mode.round });
}

/** A step is a record of the match on: the match is on and the switch does not make it an edit outside it. */
const tapsTheMatch = (screen) => screen.mode.kind === "match" && !screen.outside;

/**
 * A way to the player's page that a match has closed: a button that says why (`teamRoster.afterPost`) as its
 * tooltip and, pressed, in a message (wire.mjs), in the look of the link it stands for (button.css). With a `glyph`
 * the label is its name for a screen reader, as the pencil's link has it.
 */
function closedMarkup({ className, label, glyph = "" }) {
  const named = glyph ? ` aria-label="${escapeHtml(label)}"` : "";
  return `<button type="button" class="${className} g-roster__closed"${named} aria-disabled="true" title="${escapeHtml(t("teamRoster.afterPost"))}"`
    + `${dataAttributes({ rosterClosed: true })}>${glyph ? icon(glyph, 18) : escapeHtml(label)}</button>`;
}

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
 * Why a plus is refused: the MVP of a match, which the post-match picks; the most a roster takes, which save.mjs
 * refuses without a request (Carry T6), in the words of the server's own refusal; "" when it is not.
 */
function plusRefusal(line, key, rule) {
  if (rule.incBlocked === "mvp") return t("teamRoster.mvpInPost");
  const full = rule.via === "roster" && line.blob[key] >= MAX_SPP_COUNTER;
  return full ? t("validation.SPP_OUT_OF_RANGE", { player: line.name, counter: t(`teamRoster.counter.${key}`) }) : "";
}

/**
 * Why a whole counter is closed: the screen's lock, a player no write can name, and for a record of the match a
 * player who sits it out, or a side whose Players step is saved (`sideLocked`, the server's own words); "" when open.
 */
function closedReason(line, rule, screen) {
  if (screen.lock) return screen.lock;
  if (!line.id) return t("teamRoster.noId");
  if (rule.locked === "notPlaying") return t("teamRoster.notPlaying");
  return rule.via === "match" ? screen.sideLocked : "";
}

/**
 * Why no injury can be recorded for a player who plays the match just now, as no tap of it can be (R14): the
 * screen's lock («Reading the records…» among them), no id to name him by, the side's Players step saved; and, the
 * injury's own, an injury whose fate is not known since the read after its lost answer failed (`unsure`). "" when
 * one can.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{lock: string, sideLocked: string, unsure: boolean}} screen
 */
export function injuryClosed(line, screen) {
  return closedReason(line, { via: "match", locked: "" }, screen) || (screen.unsure ? t("teamRoster.injury.unsure") : "");
}

/**
 * «Injury in the match…» (Task 12): for a player who plays the match, while a tap is a record of it — not for one
 * who sits it out, nor with «Edit outside the match» on (an edit of the career deals no injury). Closed when the
 * match's taps are, saying why (`injuryClosed`) as the closed ways to his page do; it keeps its key either way, so
 * the focus finds it when the sheet it opened closes.
 */
function injuryMarkup(line, screen) {
  if (!tapsTheMatch(screen) || line.skip) return "";
  const reason = injuryClosed(line, screen);
  const closed = reason ? ` aria-disabled="true" title="${escapeHtml(reason)}"` : "";
  return `<button type="button" class="${classNames("g-btn g-btn--block", reason && "g-roster__closed")}" aria-haspopup="dialog"${closed}`
    + `${dataAttributes({ rosterInjury: line.key, rosterClosed: Boolean(reason) })}>${escapeHtml(t("teamRoster.injury.open"))}</button>`;
}

/**
 * What keeps a step of one counter from being taken, as the stepper is told it: the minus where `stepRule` stops
 * it — the lines count the steps still on their way, so a minus right after a plus is open (Review Focus 1); the
 * plus where it is refused; the whole counter where it is closed.
 */
function stepsOf(line, key, screen) {
  const rule = stepRule(line, key, { mode: screen.mode, outside: screen.outside });
  return { decDisabled: rule.decDisabled, incBlockedReason: plusRefusal(line, key, rule), lockedReason: closedReason(line, rule, screen) };
}

/**
 * The player's SPP counters with − and +, each with what one is worth to his race and the career's count, and in a
 * match what its records have added («+1»). A phone lays the six main ones out two to a row and the narrow ones
 * under them; a desk's panel has them all as narrow tiles. The cell carries the player's id, which a write names him by.
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
    delta: screen.mode.kind === "match" ? line.match[key] : 0, compact, data: { player: line.id }, ...stepsOf(line, key, screen),
  })).join("");
  if (desk) return `<div class="g-roster__tiles">${cells([...main, ...extra], true)}</div>`;
  return `<div class="g-roster__counters">${cells(main, false)}</div><div class="g-roster__extra">${cells(extra, true)}</div>`;
}

/** A sum of SPP at the right of its line, in `words` («+3 SPP»), or none yet. */
function sumMarkup(sum, words) {
  return `<span class="${classNames("g-roster__sppdelta", !sum && "g-roster__sppdelta--none")}">${escapeHtml(sum ? words : t("teamRoster.noChanges"))}</span>`;
}

/**
 * What the coach's edits have moved his SPP since the screen opened: «+3 SPP», or none yet. With «Edit outside the
 * match» on, the edits outside it alone: a record of the match made on this visit is none (fix round 1, Minor 4).
 */
function sessionMarkup(line, screen) {
  const moved = screen.outside ? line.sessionOutside : line.sessionSpp;
  return sumMarkup(moved, t("teamRoster.sppDelta", { delta: `${moved > 0 ? "+" : "−"}${Math.abs(moved)}` }));
}

/** What the match's records give him (`matchSpp`, never below zero: the server takes back nothing more than was recorded). */
const matchSppOf = (line) => Math.max(0, line.matchSpp);

/**
 * The row of a player opened on a phone: his SPP and what the edits have moved it, his counters, and the way to his
 * page. In a match the line says what the match's records give him, and the way to his page waits for its post-match.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function rowPanelMarkup(line, screen) {
  const href = profileUrl(line, screen);
  const label = t("teamRoster.profile");
  const closed = href && screen.mode.kind === "match";
  const profile = closed ? closedMarkup({ className: "g-btn g-btn--dark g-btn--block", label }) : href ? renderButton({ label, kind: "dark", block: true, href }) : "";
  const [context, sum] = tapsTheMatch(screen)
    ? [t("teamRoster.sppLineMatch", { spp: line.earned, match: matchWords(screen.mode) }), sumMarkup(matchSppOf(line), t("teamRoster.sppDelta", { delta: `+${matchSppOf(line)}` }))]
    : [t("teamRoster.sppLine", { spp: line.earned }), sessionMarkup(line, screen)];
  const spp = `<div class="g-roster__sppline"><span class="g-roster__sppctx">${escapeHtml(context)}</span>${sum}</div>`;
  return `<div class="g-roster__rowpanel">${spp}${countersMarkup(line, screen)}${profile}${injuryMarkup(line, screen)}</div>`;
}

/** The badge, the name, the position with what he is worth, and the pencil to his page (`closed` in a match). */
function headMarkup(line, href, closed) {
  const ariaLabel = t("teamRoster.edit", { name: line.name });
  let pencil = "";
  if (href && closed) pencil = closedMarkup({ className: "g-icon-btn g-roster__edit", label: ariaLabel, glyph: "pencil" });
  else if (href) pencil = `<a class="g-icon-btn g-roster__edit" href="${escapeHtml(href)}" aria-label="${escapeHtml(ariaLabel)}">${icon("pencil", 18)}</a>`;
  return `<div class="g-roster__phead">${renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain, large: true })}`
    + `<div class="g-roster__pwho"><h2 class="g-roster__pname">${escapeHtml(line.name)}</h2>`
    + `<p class="g-roster__pline">${escapeHtml(t("teamRoster.value", { position: line.position, value: formatMoney(line.value) }))}</p></div>${pencil}</div>`;
}

/** The five characteristics, a changed one said in words as well as in colour. */
function statsMarkup(line) {
  const changed = (change) => PLAYER_STATS.filter((stat) => line.stats[stat].change === change);
  return renderStatStrip({ values: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, line.stats[stat].text])), improved: changed("up"), lowered: changed("down") });
}

/**
 * The panel's block of counters: «SPP · manual edit», with what the edits have moved his SPP at the right (plan 07a,
 * owner's question 2); in a match «Match records · round 3», with what they give him, and under the tiles what
 * waits for the post-match. With «Edit outside the match» on the tiles are edits again, and say so.
 */
function manualMarkup(line, screen) {
  const records = tapsTheMatch(screen);
  const title = records ? t("teamRoster.records", { match: matchWords(screen.mode) }) : t("teamRoster.manual");
  const sum = records ? sumMarkup(matchSppOf(line), t("teamRoster.matchSpp", { spp: matchSppOf(line) })) : sessionMarkup(line, screen);
  const note = records ? `<p class="g-roster__matchnote">${escapeHtml(t("teamRoster.matchNote"))}</p>` : "";
  return `<section class="g-roster__manual"><div class="g-roster__sppline"><h3 class="g-roster__manualtitle">${escapeHtml(title)}</h3>`
    + `${sum}</div>${countersMarkup(line, screen, { desk: true })}${note}</section>`;
}

/** His SPP: what he may spend, what he has earned and spent, his advancements, and the cheapest next one — or, in a match (`closed`), when he may take it. */
function sppMarkup(line, href, closed) {
  let cheapest = line.cheapest === null ? t("teamRoster.maxed") : t("teamRoster.cheapest", { spp: line.cheapest });
  let advance = href ? renderButton({ label: t("teamRoster.advance"), kind: "primary", block: true, href }) : "";
  if (closed) {
    cheapest = t("teamRoster.afterPost");
    advance = href ? closedMarkup({ className: "g-btn g-btn--primary g-btn--block", label: t("teamRoster.advance") }) : "";
  }
  return `<div class="g-roster__spp"><div class="g-roster__spptop">`
    + `<p class="g-roster__avail"><span class="g-roster__availn">${escapeHtml(line.available)}</span> <span class="g-roster__availl">${escapeHtml(t("teamRoster.available"))}</span></p>`
    + `<p class="g-roster__ledger"><span class="g-roster__ledgerline">${escapeHtml(t("teamRoster.earned", { spp: line.earned }))}</span>`
    + `<span class="g-roster__ledgerline">${escapeHtml(t("teamRoster.spent", { spp: line.spent }))}</span></p></div>`
    + renderProgressDots({ total: advancementRanks.length, done: line.level, label: t("teamRoster.advancements") })
    + `${advance}<p class="g-roster__cheapest">${escapeHtml(cheapest)}</p></div>`;
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
  const closed = screen.mode.kind === "match";
  const next = t("teamRoster.nextMatch", { state: line.skip ? t("teamRoster.sits") : t("teamRoster.plays") });
  return `${headMarkup(line, href, closed)}${statsMarkup(line)}${manualMarkup(line, screen)}${sppMarkup(line, href, closed)}${skillsMarkup(line)}`
    + `<p class="g-roster__next">${escapeHtml(next)}</p>${injuryMarkup(line, screen)}`;
}

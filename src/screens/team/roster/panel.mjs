/**
 * What the roster says of one player beyond his row: the row opened on a phone, and the panel beside the table on a
 * desk (plan 07a, decisions 20 and 21). The row leads to his profile (stage 07d); both say why an advancement or an
 * edit of him is closed (player-access.mjs). The panel's pencil opens his edit (player-sheets.mjs) and its «Advance»
 * his advancement (advance.mjs), as the profile's do; the undo of his last advancement is his fix by hand's (fix.mjs).
 *
 * The phone's open row holds his SPP counters with − and + (Task 10): outside a match a step is a save of the roster
 * (save.mjs), and the count is the career. The desk's panel holds them only while a match is on (owner's D3,
 * DeskRoster.html): outside one a desk shows his SPP, skills and actions, and his manual SPP edits are stage 07d's
 * player edit, whose window carries the same tiles (player-sheets.mjs) — no save of the roster starts from the panel
 * then. A player the roster stores no id for (`line.id === ""`) has no page to lead to — an empty id would make the
 * roster's own address — and no save can name him, so his counters are closed.
 *
 * During a match (Task 11, decision 13) a step is a record of the match, and the count says beside it what the
 * match has added; the switch «Edit outside the match» makes it an edit of the career instead. A desk lays the nine
 * counters out three by three as DeskRosterLive.html (D1). «Advance» and the pencil are closed until the post-match:
 * an advancement would change the roster the match's finish checks. The phone's way to his profile stays open (K20):
 * the profile reads, and closes its own writes, saying why.
 *
 * Under it all stands the pair of actions (stages 07b and 07c; StatsHire.html, StatsLive.html, DeskRosterPrep.html,
 * DeskRosterLive.html): first, outside a match, «Miss a match…» for a player who plays the next one, «Back on the
 * roster» for one who misses it — never a second mark over the first; during one «Injury in the match…» for a player
 * who plays it (Task 12, decision 14), closed with the match's taps. Second «Sell», or «Cancel purchase» for a player
 * bought since the last match (stage 07c), which a match closes, saying why.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { advancementRanks } from "../../../domain/league-rules.mjs";
import { MAX_SPP_COUNTER } from "../../../domain/roster/validate.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderActionStepper } from "../../../ui/action-stepper.mjs";
import { icon } from "../../../ui/icons.mjs";
import { assertLinkHref, classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderProgressDots } from "../../../ui/progress-dots.mjs";
import { renderSkillChips } from "../../../ui/skill-chip.mjs";
import { renderStatStrip } from "../../../ui/stat-strip.mjs";
import { counterSlots, stepRule } from "./model.mjs";
import { advanceClosed, advanceHintOf, closedAdvanceMarkup, closedMarkup, editClosed } from "./player-access.mjs";
import { playerHref } from "./source.mjs";

/**
 * Words with some of their values in bold (DeskRoster.html: «Next match: **Plays**», «Primary: **General**»):
 * `t(key, params)` escaped, each value named in `bold` wrapped in `<b>`, with `boldClass` when given.
 *
 * @param {string} key @param {Record<string, string|number>} params @param {string[]} bold @param {string} [boldClass]
 * @returns {string} markup
 */
export function boldWords(key, params, bold, boldClass = "") {
  const marks = Object.fromEntries(bold.map((name, index) => [name, `\u0001${index}\u0001`]));
  const html = escapeHtml(t(key, { ...params, ...marks }));
  const open = boldClass ? `<b class="${boldClass}">` : "<b>";
  // A function, not a string: a «$&» or «$<» in a coach's note is his text, not a replacement pattern.
  return bold.reduce((out, name, index) => out.replace(`\u0001${index}\u0001`, () => `${open}${escapeHtml(params[name])}</b>`), html);
}

/** The player's page, or "" for one with no stored id: on an admin's visit his page in the administration (source.mjs). */
const profileUrl = (line, screen) => (line.id ? playerHref(screen.team.id, line.id) : "");

/** The match on, in the words a line about it uses: «round 3», or «friendly» for a match that has no round. */
export function matchWords(mode) {
  return mode.round === null || mode.round === undefined ? t("teamRoster.match.friendly") : t("teamRoster.match.round", { round: mode.round });
}

/** The match on as what records go into (the banners'): «round 3», or «the friendly» for a match that has no round. */
export function matchTarget(mode) {
  return mode.round === null || mode.round === undefined ? t("teamRoster.match.friendlyTarget") : t("teamRoster.match.round", { round: mode.round });
}

/** An injury in words: «Seriously Hurt», a lasting one with its characteristic, «Lasting Injury (AG)». */
export function injuryWords({ code, stat }) {
  const injury = t(`teamRoster.injury.${code}`);
  return stat ? t("teamRoster.injury.withStat", { injury, stat: t(`stats.${stat}`) }) : injury;
}

/**
 * Why a player who misses the next match misses it (stage 07b, decision 14), "" where nothing says why: the season's
 * retirement; another reason as the coach wrote it; an injury as the match's are said. A 2.x skip, which has no reason,
 * and another reason with no words written (K10) say nothing here.
 */
function absenceReason({ retired, absence }) {
  if (retired) return t("teamRoster.skips.retired");
  if (!absence) return "";
  if (absence.code === "other") return absence.note ?? "";
  return injuryWords(absence);
}

/**
 * The line under the name of a player who misses the next match: why, or where nothing says why, that he misses it
 * (the words 07a drew for every skip).
 *
 * @param {import("./model.mjs").PlayerLine} line
 */
export function absenceWords(line) {
  return absenceReason(line) || t("teamRoster.skip");
}

/**
 * What a save of the roster resets during a preparation, the steps named as the pre-match names them (R12): a sheet
 * whose write is a save of the roster says it (`teamRoster.prep.sub`, any save); the banner says it in its prototype's
 * words (`teamRoster.prep.banner`: a desk's saves are hiring, selling and missed matches; a phone's
 * `…bannerPhone` adds its SPP edits, which save the roster too).
 */
export function prepResetWords(key = "teamRoster.prep.sub") {
  return t(key, { roster: t("pre.step.roster"), inducements: t("pre.step.inducements"), kickoff: t("pre.step.review") });
}

/**
 * «Next match: **Plays**», or that he sits it out — with why, when something says it (K3: a 2.x skip keeps 07a's
 * words, which would only say it twice) — or, during a match, the injury it has dealt him (DeskRosterLive.html).
 * The state is bold, and red when he will not play.
 */
function nextMatchMarkup(line, screen) {
  let state = t("teamRoster.plays");
  if (screen.mode.kind === "match" && line.injury) state = t("teamRoster.nextInjury", { injury: injuryWords(line.injury) });
  else if (line.skip) {
    const reason = absenceReason(line);
    state = reason ? t("teamRoster.skips.sits", { reason }) : t("teamRoster.sits");
  }
  const alert = state !== t("teamRoster.plays");
  return `<p class="g-roster__next">${boldWords("teamRoster.nextMatch", { state }, ["state"], alert ? "g-roster__nextstate--alert" : "")}</p>`;
}

/** A step is a record of the match on: the match is on and the switch does not make it an edit outside it. */
const tapsTheMatch = (screen) => screen.mode.kind === "match" && !screen.outside;

/**
 * Why no missed match, nor its end, nor a death can be marked for a player just now, "" when it can (stage 07b): a
 * match is on (R8: the roster is not written during one, and the match's injury is the place for it), the screen's
 * lock, no id to name him by; and for a write the queue does not carry (`direct`: a death, its undo), a step of the
 * queue that waits or is on its way, which that write would move the revision under.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string, save: {status: string, waiting: number}}} screen
 * @param {{direct?: boolean}} [options]
 */
export function markClosed(line, screen, { direct = false } = {}) {
  if (screen.mode.kind === "match") return t("teamRoster.mark.closed");
  if (screen.lock) return screen.lock;
  if (!line.id) return t("teamRoster.mark.noId");
  const saving = screen.save.status === SAVE_STATUS.SAVING || screen.save.status === SAVE_STATUS.DIRTY;
  return direct && (screen.save.waiting > 0 || saving) ? t("teamRoster.mark.waitSave") : "";
}

/**
 * Why «Back on the roster» is closed for a player who misses the next match: a retirement for the season, which it
 * does not end (owner's question 2: the roster would read him as missing it again), else as a mark is.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {Parameters<typeof markClosed>[1]} screen
 */
export function returnClosed(line, screen) {
  return line.retired ? t("teamRoster.skips.retiredClosed") : markClosed(line, screen);
}

/**
 * Why nothing can be hired or sold just now (stage 07c), "" when it can: a match is on (R8: the roster is not written
 * during one; its finish checks the roster it started with), then the screen's lock — the games unread, the roster
 * read, a death on its way, another device's save to settle.
 *
 * @param {{mode: {kind: string}, lock: string}} screen
 */
export function hireClosed(screen) {
  if (screen.mode.kind === "match") return t("teamRoster.market.closed");
  return screen.lock;
}

/**
 * Why a player cannot be sold, nor his purchase cancelled, just now (stage 07c), "" when he can: what closes the
 * market (`hireClosed`: a match, the screen's lock), no id to name him by, and for a sale — never a cancel (owner's
 * Q1) — a roster of seven or fewer (`line.removal.blocked`, the league's rule).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{mode: {kind: string}, lock: string}} screen
 */
export function sellClosed(line, screen) {
  const closed = hireClosed(screen);
  if (closed) return closed;
  if (!line.id) return t("teamRoster.sell.noId");
  return line.removal.blocked ? t("validation.PLAYER_SALE_MIN") : "";
}

/**
 * One button of the row of actions, as wide as the others; closed, it says why and keeps what names it. `data.key`
 * tells the two apart when the screen is patched: «Back on the roster» pressed twice is not, the second time, the
 * «Miss a match…» drawn in its place.
 */
function actionMarkup({ label, reason, data, dialog = false }) {
  if (reason) return closedMarkup({ className: "g-btn", label, reason, data });
  return `<button type="button" class="g-btn"${dialog ? ' aria-haspopup="dialog"' : ""}${dataAttributes(data)}>${escapeHtml(label)}</button>`;
}

/**
 * «Sell», which opens the sheet that asks first (sell-sheet.mjs); for a purchase no match has sealed yet «Cancel
 * purchase». In a match it is «Sell», closed, as the prototypes draw it (a match's start seals a purchase).
 */
function sellMarkup(line, screen) {
  const cancel = screen.mode.kind !== "match" && line.removal.type === "cancel-purchase";
  const label = cancel ? t("teamRoster.sell.cancelOpen") : t("teamRoster.sell.open");
  return actionMarkup({ label, reason: sellClosed(line, screen), data: { key: "roster-sell", rosterSell: line.key }, dialog: true });
}

/**
 * The player's pair of actions (stage 07c, decision 7): two equal columns 8px apart. First, outside a match (decisions
 * 16, 17), «Miss a match…», which opens the sheet of reasons, for one who plays the next match, or «Back on the
 * roster» for one who misses it; during one «Injury in the match…» (`injuryMarkup`) in that place, and nothing when no
 * injury can be his — he sits the match out, or «Edit outside the match» is on — so the pair is one closed «Sell».
 * Second «Sell» or «Cancel purchase» (`sellMarkup`).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function actionsMarkup(line, screen) {
  let first;
  if (screen.mode.kind === "match") first = injuryMarkup(line, screen);
  else {
    first = actionMarkup(line.skip
      ? { label: t("teamRoster.skips.return"), reason: returnClosed(line, screen), data: { key: "roster-return", rosterReturn: line.key } }
      : { label: t("teamRoster.mark.open"), reason: markClosed(line, screen), data: { key: "roster-mark", rosterMark: line.key }, dialog: true });
  }
  return `<div class="g-roster__actions">${first}${sellMarkup(line, screen)}</div>`;
}

/** Where a skill came from in 07a's words: «starting», «primary», «the captain's». */
const sourceWords = (skill) => t(`teamRoster.source.${skill.source}`);

/**
 * Where a skill came to him (K29): an advancement's type — on the profile in full and, when it was rolled, how («Random
 * primary skill · rolled on the site»); in the desk's panel (`short`) as DeskRoster's cards name it («Chosen primary») —
 * and any other skill in the roster's own words («starting», «the captain's»).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./model.mjs").PlayerLine["skills"][number]} skill
 * @param {{short?: boolean}} [options]
 */
export function skillSourceOf(line, skill, { short = false } = {}) {
  const taken = skill.advancement === null ? null : line.advancements[skill.advancement];
  if (!taken) return sourceWords(skill);
  if (short) return t(`teamAdvance.typeShort.${taken.type}`);
  const type = t(`teamAdvance.type.${taken.type}`);
  return taken.via ? `${type} · ${t(`teamPlayer.via.${taken.via}`)}` : type;
}

/**
 * A player's skills as chips: in his row, or (`card`) as the panel's cards, each saying where it came from — in 07a's
 * words, or as `sourceOf` says it (the profile and the desk's panel name the advancement, K29: `skillSourceOf`).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{card?: boolean, sourceOf?: (skill: import("./model.mjs").PlayerLine["skills"][number]) => string}} [options]
 */
export function skillChipsMarkup(line, { card = false, sourceOf = sourceWords } = {}) {
  const skills = line.skills.map((skill) => ({ name: skill.name, gained: skill.gained, source: card ? sourceOf(skill) : "" }));
  return renderSkillChips({ skills, card });
}

/**
 * His injuries (spec UI §12, 07b's hand-over): on the profile «Injuries» with a line each — why he misses the next
 * match, his Niggling Injuries, each lasting one with its characteristic — or that there are none; in the desk's panel
 * (`desk`) one line of the Niggling Injuries and the lasting ones (the panel says the missed match already), or none.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {{desk?: boolean}} [options]
 */
export function injuriesMarkup(line, { desk = false } = {}) {
  const { niggling, lasting } = line.injuries;
  const named = [
    ...(niggling ? [t("teamPlayer.niggling", { count: niggling })] : []),
    ...lasting.map(({ stat, count }) => t("teamPlayer.lasting", { stat: t(`stats.${stat}`), count })),
  ];
  if (desk) return named.length ? `<p class="g-roster__injuries">${escapeHtml(named.join(" · "))}</p>` : "";
  const all = [...(line.skip ? [t("teamPlayer.misses", { reason: absenceWords(line) })] : []), ...named];
  const body = all.length
    ? `<ul class="g-profile__injurylist">${all.map((words) => `<li class="g-profile__injury">${escapeHtml(words)}</li>`).join("")}</ul>`
    : `<p class="g-profile__none">${escapeHtml(t("teamPlayer.noInjuries"))}</p>`;
  return `<section class="g-profile__injuries"><h2 class="g-profile__title">${escapeHtml(t("teamPlayer.injuries"))}</h2>${body}</section>`;
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
 * who sits it out, nor with «Edit outside the match» on (an edit of the career deals no injury). Once one is
 * recorded it names it, «Injury: Seriously Hurt» (Stats.html). Closed when the match's taps are, saying why
 * (`injuryClosed`) as the closed ways to his page do; it keeps its key either way, so the focus finds it when the
 * sheet it opened closes.
 */
function injuryMarkup(line, screen) {
  if (!tapsTheMatch(screen) || line.skip) return "";
  const reason = injuryClosed(line, screen);
  const closed = reason ? ` aria-disabled="true" title="${escapeHtml(reason)}"` : "";
  const label = line.injury ? t("teamRoster.injury.named", { injury: injuryWords(line.injury) }) : t("teamRoster.injury.open");
  return `<button type="button" class="${classNames("g-btn", reason && "g-roster__closed")}" aria-haspopup="dialog"${closed}`
    + `${dataAttributes({ rosterInjury: line.key, rosterClosed: Boolean(reason) })}>${escapeHtml(label)}</button>`;
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
 * match what its records have added («+1»). A phone lays them all out alike, two to a row (44px buttons; the owner,
 * 2026-10-23: no narrow row of three under the main six); a desk's panel has all nine as tiles three to a row,
 * «− count +» on one line under the label (D1, D2). The cell carries the player's id, which a write names him by.
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 * @param {{desk?: boolean}} [options]
 * @returns {string}
 */
export function countersMarkup(line, screen, { desk = false } = {}) {
  const { main, extra } = counterSlots(screen.race);
  const cells = [...main, ...extra].map(({ key, spp }) => renderActionStepper({
    key, label: t(`teamRoster.counter.${key}`), name: t(`teamRoster.counterName.${key}`), spp, value: line.career[key] ?? 0, player: line.name,
    delta: screen.mode.kind === "match" ? line.match[key] : 0, tile: desk, data: { player: line.id }, ...stepsOf(line, key, screen),
  })).join("");
  return `<div class="g-roster__${desk ? "tiles" : "counters"}">${cells}</div>`;
}

/** A sum of SPP at the right of its line, in `words` («+3 SPP»), or none yet. */
function sumMarkup(sum, words) {
  return `<span class="${classNames("g-roster__sppdelta", !sum && "g-roster__sppdelta--none")}">${escapeHtml(sum ? words : t("teamRoster.noChanges"))}</span>`;
}

/**
 * What the coach's edits have moved his SPP since the screen opened: «+3 SPP», or none yet. With «Edit outside the
 * match» on, the edits outside it alone: a record of the match made on this visit is none (fix round 1, Minor 4).
 */
export function sessionMarkup(line, screen) {
  const moved = screen.outside ? line.sessionOutside : line.sessionSpp;
  return sumMarkup(moved, t("teamRoster.sppDelta", { delta: `${moved > 0 ? "+" : "−"}${Math.abs(moved)}` }));
}

/** What the match's records give him (`matchSpp`, never below zero: the server takes back nothing more than was recorded). */
const matchSppOf = (line) => Math.max(0, line.matchSpp);

/**
 * The row of a player opened on a phone: his SPP and what the edits have moved it, his counters, the way to his
 * profile, and under it his row of actions. In a match the line says what the match's records give him; the way to
 * his profile stays open (K20).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function rowPanelMarkup(line, screen) {
  const href = profileUrl(line, screen);
  const profile = href ? profileLinkMarkup(t("teamRoster.profile"), href) : "";
  const [context, sum] = tapsTheMatch(screen)
    ? [boldWords("teamRoster.sppLineMatch", { spp: line.earned, match: matchWords(screen.mode) }, ["spp"]), sumMarkup(matchSppOf(line), t("teamRoster.sppDelta", { delta: `+${matchSppOf(line)}` }))]
    : [boldWords("teamRoster.sppLine", { spp: line.earned }, ["spp"]), sessionMarkup(line, screen)];
  const spp = `<div class="g-roster__sppline"><span class="g-roster__sppctx">${context}</span>${sum}</div>`;
  return `<div class="g-roster__rowpanel">${spp}${countersMarkup(line, screen)}${profile}${actionsMarkup(line, screen)}</div>`;
}

/**
 * A way to a player's page, its chevron after the words: a living player's in the dark of navigation (Stats.html:
 * «Profile and advancement ›»), a fallen one's white in its ring (`outline`, StatsInjured.html: «Player's profile ›»);
 * its address is checked as every link's is (`assertLinkHref`).
 * @param {string} label @param {string} href @param {{outline?: boolean}} [look]
 */
export function profileLinkMarkup(label, href, { outline = false } = {}) {
  assertLinkHref(href);
  return `<a class="g-btn${outline ? "" : " g-btn--dark"} g-btn--block" href="${escapeHtml(href)}">${escapeHtml(label)}${icon("chevron", 14)}</a>`;
}

/**
 * The badge, the name, the position with what he is worth, and the pencil, which opens the edit of his number, name and
 * captaincy (stage 07d, DeskRosterEdit.html) — closed, saying why, in a match, by the screen's lock and for a player no
 * write can name (`editClosed`); it keeps his key either way, so the focus finds it when the edit closes.
 */
function headMarkup(line, screen) {
  const label = t("teamRoster.edit", { name: line.name });
  const reason = editClosed(line, screen);
  const data = { playerEdit: line.key };
  const pencil = reason
    ? closedMarkup({ className: "g-icon-btn g-roster__edit", label, glyph: "pencil", reason, data })
    : `<button type="button" class="g-icon-btn g-roster__edit" aria-haspopup="dialog" aria-label="${escapeHtml(label)}"${dataAttributes(data)}>${icon("pencil", 18)}</button>`;
  return `<div class="g-roster__phead">${renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain, large: true })}`
    + `<div class="g-roster__pwho"><h2 class="g-roster__pname">${escapeHtml(line.name)}</h2>`
    + `<p class="g-roster__pline">${escapeHtml(t("teamRoster.value", { position: line.position, value: formatMoney(line.value) }))}</p></div>${pencil}</div>`;
}

/** The five characteristics, a changed one said in words as well as in colour (a fallen player's profile has them too). */
export function statsMarkup(line) {
  const changed = (change) => PLAYER_STATS.filter((stat) => line.stats[stat].change === change);
  return renderStatStrip({ values: Object.fromEntries(PLAYER_STATS.map((stat) => [stat, line.stats[stat].text])), improved: changed("up"), lowered: changed("down") });
}

/**
 * The panel's block of counters, a desk's during a match only (D3): «Match records · round 3», with what they give
 * him at the right, and under the tiles what waits for the post-match. With «Edit outside the match» on the tiles are
 * edits of the career and say so, «Edit outside the match · <name>» with what the edits have moved his SPP
 * (DeskRosterLive.html). Outside a match there is none: the panel is DeskRoster.html's, with no counters.
 */
function manualMarkup(line, screen) {
  if (screen.mode.kind !== "match") return "";
  const records = tapsTheMatch(screen);
  const title = records ? t("teamRoster.records", { match: matchWords(screen.mode) }) : t("teamRoster.match.outsideTitle", { name: line.name });
  const sum = records ? sumMarkup(matchSppOf(line), t("teamRoster.matchSpp", { spp: matchSppOf(line) })) : sessionMarkup(line, screen);
  const note = records ? `<p class="g-roster__matchnote">${escapeHtml(t("teamRoster.matchNote"))}</p>` : "";
  return `<section class="g-roster__manual"><div class="g-roster__sppline"><h3 class="g-roster__manualtitle">${escapeHtml(title)}</h3>`
    + `${sum}</div>${countersMarkup(line, screen, { desk: true })}${note}</section>`;
}

/**
 * His SPP: what he may spend, what he has earned and spent, his advancements, «Advance» — a button that opens his
 * advancement's window (DeskRosterAdv.html), closed, saying why, when no advancement can be taken (`advanceClosed`); it
 * names him either way, so the focus finds it when the window closes — and under it the cheapest one open, or why it
 * is closed. No undo of his last advancement under them, as DeskRoster.html (decision 40: his fix by hand's).
 */
function sppMarkup(line, screen) {
  const reason = advanceClosed(line, screen);
  const data = { playerAdvance: line.key };
  const advance = reason ? closedAdvanceMarkup({ reason, data })
    : `<button type="button" class="g-btn g-btn--primary g-btn--block" aria-haspopup="dialog"${dataAttributes(data)}>${icon("up", 20)}${escapeHtml(t("teamRoster.advance"))}</button>`;
  const cheapest = advanceHintOf(line, screen);
  return `<div class="g-roster__spp"><div class="g-roster__spptop">`
    + `<p class="g-roster__avail"><span class="g-roster__availn">${escapeHtml(line.available)}</span> <span class="g-roster__availl">${escapeHtml(t("teamRoster.available"))}</span></p>`
    + `<p class="g-roster__ledger"><span class="g-roster__ledgerline">${escapeHtml(t("teamRoster.earned", { spp: line.earned }))}</span>`
    + `<span class="g-roster__ledgerline">${escapeHtml(t("teamRoster.spent", { spp: line.spent }))}</span></p></div>`
    + renderProgressDots({ total: advancementRanks.length, done: line.level, label: t("teamRoster.advancements") })
    + `${advance}${cheapest ? `<p class="g-roster__cheapest">${escapeHtml(cheapest)}</p>` : ""}</div>`;
}

/** A list of skill categories; a position with none in an access has a dash. */
const categories = (names) => (names.length ? names.join(", ") : "–");

/**
 * His skills as cards with where each came from — an advancement's type as DeskRoster names it — the categories he may
 * take them from, those in bold, and his injuries in a line.
 */
function skillsMarkup(line) {
  const access = boldWords("teamRoster.access", { primary: categories(line.primary), secondary: categories(line.secondary) }, ["primary", "secondary"]);
  const sourceOf = (skill) => skillSourceOf(line, skill, { short: true });
  return `<section class="g-roster__pblock"><h3 class="g-roster__ptitle">${escapeHtml(t("teamRoster.skills"))}</h3>`
    + `${skillChipsMarkup(line, { card: true, sourceOf })}<p class="g-roster__access">${access}</p>${injuriesMarkup(line, { desk: true })}</section>`;
}

/**
 * The panel beside the table on a desk (DeskRoster.html, DeskRosterLive.html): the player the coach chose, or the
 * table's first — his head, his characteristics, in a match the counters, his SPP, his skills and his injuries (a line
 * DeskRoster.html has not, stage 07d), then the next match with the pair of actions under a rule, and last his «Career»
 * under another (stage 07e, DeskRosterCareer.html: the desk's form of career.mjs's block, which the caller draws).
 *
 * @param {import("./model.mjs").PlayerLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 * @param {{careerHtml?: string}} [options] `careerHtml` is markup of career.mjs's `careerMarkup()`, "" for a player no
 *   read can name
 */
export function sidePanelMarkup(line, screen, { careerHtml = "" } = {}) {
  return `${headMarkup(line, screen)}${statsMarkup(line)}${manualMarkup(line, screen)}${sppMarkup(line, screen)}${skillsMarkup(line)}`
    + `<section class="g-roster__nextblock">${nextMatchMarkup(line, screen)}${actionsMarkup(line, screen)}</section>${careerHtml}`;
}

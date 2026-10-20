/**
 * A roll in the advancement's sheet (Adv3Random, Adv3Stat, Adv3StatTable; DeskRosterAdv, DeskRosterAdvStat). A random
 * skill is two dice (the owner, 2026-10-20; decisions 37–38): on the site the pair, of which the coach takes one; at the
 * table the two faces the coach marks, then the one taken; no attempts are shown, and there is no die to roll once the
 * pair is in. Under the pair the sixteen faces of the Skill Table's column, his skills struck through — a column shorter
 * than the die has blank faces (owner, 2026-10-16) — the faces the dice came up on the accent. A characteristic's D8 is
 * the site's, or at the table the face the coach presses. Once a roll is made on the site the type, the category and the
 * way are fixed: the roll waits for the player until an advancement of its kind takes it.
 *
 * The way is a segmented control over a line that says what happens; a die is ui/die.mjs's — in a card of the pair its
 * spans, since a button holds no `div` (K10). The pair (Adv3Random's die and result, doubled, in Adv3Stat's card), the
 * faces of the D8 at the table and the characteristics a face offers are radio groups of the sheet's own (radio-group.mjs's
 * `radioGroupMarkup`); the D16's faces a list on the site and buttons that mark at the table (`aria-pressed`). What cannot
 * be pressed — a die not in yet, one of his skills, a blank face, a third mark — and a characteristic past its limits are
 * closed, saying why on a press (K7). What the sheet says of the roll — the category it was made in, a roll of the other
 * kind waiting, an answer lost, why it cannot be taken — stands under the result. A phone's button is the sheet's
 * (advance-sheet.mjs); a desk rolls in its column.
 *
 * Each function takes `{sheet, choices, desk}`: the sheet as the screen draws it (advance.mjs's, with why a roll is
 * closed, `rollReason`, and whether one is out, `busy`), what it offers him (`choicesOf`), and whether it is a desk's.
 * A skill's sheet says how an advancement gave the skill, with a site roll's attempts (`rollBlockMarkup`, Task 11).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { STAT_ROLL_TABLE, rolledDice, skillFaces, statsForRoll } from "../../../domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys } from "../../../domain/roster/players.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderDie } from "../../../ui/die.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderSegmentedControl } from "../../../ui/segmented-control.mjs";
import { bindable, boundSkill, chosenOf, diceCount, keptWords, noteWords, pairOf, pairWhole, rolledWords, waitingWords, wayFixed } from "./advance.mjs";
import { boldWords } from "./panel.mjs";
import { radioGroupMarkup } from "./radio-group.mjs";
import { refusalWordsOf } from "./save.mjs";
import { footButton } from "./sheets.mjs";

/** The name the way's segmented control is wired by (wireSegmentedControls). */
export const VIA_GROUP = "advance-via";

/**
 * The way — «Roll on the site» or «Rolled at the table» — and the line under it. Fixed once a roll is made on the site
 * (decision 9): each segment closed, saying why; a roll the player cannot take as it is leaves the table open (decision
 * 11, fix round 1).
 * @param {{sheet: object, choices: object}} props
 */
export function viaMarkup({ sheet, choices }) {
  const fixed = wayFixed(sheet, choices);
  const items = ["site", "table"].map((value) => ({
    value, label: value === "site" ? t("teamAdvance.via.site") : t("teamAdvance.via.table"), disabled: fixed, reason: fixed ? keptWords(sheet) : "",
  }));
  const control = renderSegmentedControl({ label: t("teamAdvance.via.label"), items, selected: sheet.via, data: { segGroup: VIA_GROUP } });
  return `${control}<p class="g-advance__note">${escapeHtml(noteWords(sheet, choices))}</p>`;
}

/**
 * «Roll two D16» or «Roll D8», drawn on the site until the dice are in: busy while the ask is out; closed, saying why —
 * the screen's reason, a step of the queue that waits or is on its way (decision 10), a roll of the other kind waiting
 * (decision 11); and a press that reaches it once there is nothing to roll is told why (`rolledWords`).
 * @param {{sheet: object, choices: object}} props @param {string} label
 */
export function rollButtonMarkup({ sheet, choices }, label) {
  const reason = rolledWords(sheet, choices) || sheet.rollReason || waitingWords(sheet, sheet.type);
  return footButton({ label, kind: "primary", data: { advanceRoll: true }, busy: Boolean(sheet.busy), reason });
}

/** What one attempt of the die says: its face, and its skill, or why it was rolled again. */
function attemptWords({ roll: face, skill, duplicate }) {
  if (typeof skill !== "string") return t("teamAdvance.attempt.blank", { face });
  return duplicate ? t("teamAdvance.attempt.held", { face, skill }) : t("teamAdvance.attempt.kept", { face, skill });
}

/**
 * The attempts of a random skill's roll on the site in the skill's sheet (§9.5; Task 11, until Task 22 says what the
 * dice came up instead): «Attempts: N», a caption, and the list — each face, its skill, and why it was rolled again.
 * Nothing to press, so no other sheet hears a press it cannot take; the advancement's sheet shows none (the owner's
 * answer, 2026-10-20). None for another roll.
 * @param {object|null} roll as the server answers it
 */
export function attemptsMarkup(roll) {
  const tries = roll?.purpose === "random_skill" && Array.isArray(roll.result?.attempts) ? roll.result.attempts : [];
  if (!tries.length) return "";
  return `<p class="g-advance__attemptscaption">${escapeHtml(t("teamAdvance.attempts", { count: tries.length }))}</p>`
    + `<ol class="g-advance__attemptlist">${tries.map((attempt) => `<li class="g-advance__attempt">${escapeHtml(attemptWords(attempt))}</li>`).join("")}</ol>`;
}

/** A line of the skill's sheet about a site roll: read, on its way, failed (`bad`), or not on the site. */
const rollStateMarkup = (words, bad = false) => `<p class="${classNames("g-roster__rollstate", bad && "g-roster__rollstate--bad")}" role="status">${escapeHtml(words)}</p>`;

/**
 * The roll a site advancement of his names, among the team's rolls as read (`readRolls`, which answers every player's,
 * T3): by its id, and his; null for none.
 * @param {object[]} rolls @param {import("./model.mjs").PlayerLine} line @param {{rollId: string}} taken his advancement
 */
export function siteRollOf(rolls, line, taken) {
  return (rolls ?? []).find((roll) => roll?.id === taken.rollId && String(roll.playerId) === String(line.id)) ?? null;
}

/**
 * A site roll's attempts in the skill's sheet, as the visit read the team's rolls (`attemptsMarkup`) — from the list read
 * before while a read for another roll is on its way (final wave, T11 N5); else while the read is on its way, when it failed, or when the site has no such roll of
 * his, said so. Nothing for an advancement not rolled on the site, nor for a D8 a skill took the place of (a
 * characteristic's: no attempts, so nothing is read for it — fix round 1).
 */
function siteRollMarkup(line, taken, rolls) {
  if (taken.via !== "site" || taken.type === "stat") return "";
  const roll = siteRollOf(rolls?.rolls, line, taken);
  if (roll) return attemptsMarkup(roll);
  if (!rolls || rolls.loading) return rollStateMarkup(t("teamPlayer.roll.reading"));
  if (rolls.error) return rollStateMarkup(t("teamPlayer.roll.failed", { reason: rolls.error }), true);
  return rollStateMarkup(t("teamPlayer.roll.none"));
}

/**
 * How an advancement gave a skill, in the skill's sheet (decision 19; StatsSkill.html has none): «Advancement 1 · Random
 * primary skill · rolled on the site» — a chosen one without the way — and a site roll's attempts (`siteRollMarkup`),
 * read once a visit (player.mjs). Nothing for a skill no advancement gave.
 *
 * @param {{line: import("./model.mjs").PlayerLine, skill: string, rolls: null | {loading: true, rolls: object[]|null} | {rolls: object[]} | {error: string}}} props
 *   `rolls` the team's rolls as the visit read them; on its way, a read keeps the list read before it
 */
export function rollBlockMarkup({ line, skill, rolls }) {
  const at = line.skills.find(({ name }) => name === skill)?.advancement ?? null;
  const taken = at === null ? null : line.advancements[at];
  if (!taken) return "";
  const [level, type] = [at + 1, t(`teamAdvance.type.${taken.type}`)];
  const words = taken.via ? t("teamPlayer.roll.line", { level, type, via: t(`teamPlayer.via.${taken.via}`) }) : t("teamPlayer.roll.lineBare", { level, type });
  return `<div class="g-roster__rollblock"><p class="g-roster__rollline">${escapeHtml(words)}</p>${siteRollMarkup(line, taken, rolls)}</div>`;
}

/**
 * What the sheet says of the roll, under its result, in the player sheets' refusal line (T8): the category it was made in
 * when another was asked (the server's roll that waited; not a refusal — quiet, `g-advance__info`), a roll of the other
 * kind waiting, an answer that did not come, and why the site's roll cannot be taken as it is (`rollRefusal`).
 */
function alertsMarkup(sheet, choices) {
  const line = (words, info = false) => `<p class="${classNames("g-player-sheet__refusal", info && "g-advance__info")}" role="${info ? "status" : "alert"}">${escapeHtml(words)}</p>`;
  const category = sheet.roll?.purpose === "random_skill" ? sheet.roll.params?.category : "";
  const waiting = waitingWords(sheet, sheet.type);
  return [
    category && sheet.asked && category !== sheet.asked ? line(t("teamAdvance.otherCategory", { category }), true) : "",
    waiting ? line(waiting) : "",
    sheet.lost ? line(t("teamAdvance.lost")) : "",
    sheet.via === "site" && choices.rollRefused ? line(refusalWordsOf("teamAdvance", choices.rollRefused)) : "",
  ].join("");
}

/** «The roll stays the player's…», once one is made on the site. */
const keptMarkup = (sheet) => (sheet.roll ? `<p class="g-advance__kept">${escapeHtml(keptWords(sheet))}</p>` : "");

/** A face's number and its skill, or «—» for a blank face, which a screen reader hears as «no skill». */
function faceInnerMarkup(face, skill) {
  const name = skill === null
    ? `<span aria-hidden="true">—</span><span class="g-sr-only">${escapeHtml(t("teamAdvance.blank"))}</span>` : escapeHtml(skill);
  return `<span class="g-advance__facenum">${escapeHtml(String(face))}</span><span class="g-advance__facename">${name}</span>`;
}

/** What a screen reader hears after a face of the site's list: that the skill is his, that a die came up on it. */
const saidMarkup = (words) => ` <span class="g-sr-only">${escapeHtml(words)}</span>`;

/**
 * The sixteen faces of the D16 over the category's column (decision 12): the site's roll's own column, or at the table
 * the column as the Skill Table has it, his skills struck through. On the site a list that only shows (decision 37),
 * the faces the dice came up on the accent; at the table buttons that mark the faces the dice showed (decision 38,
 * `aria-pressed`, each in the tab order) — a blank face, one of his skills and, the pair whole, a face not marked
 * closed, saying why on a press (K7); a marked one is pressed again to take its mark off.
 */
function facesMarkup({ sheet, choices }) {
  const site = sheet.via === "site";
  const candidates = site && sheet.roll ? sheet.roll.params?.candidates ?? [] : choices.skills.map(({ name }) => name);
  const held = choices.player ? heldSkillKeys(choices.player.row, choices.player) : new Set();
  const his = (skill) => skill !== null && held.has(canonicalSkillName(skill));
  const label = escapeHtml(t("teamAdvance.facesLabel"));
  if (site) {
    const hits = new Set(rolledDice(sheet.roll).map(({ face }) => face));
    const items = skillFaces(candidates).map(({ face, skill }) => {
      const words = `${his(skill) ? saidMarkup(t("teamAdvance.held")) : ""}${hits.has(face) ? saidMarkup(t("teamAdvance.rolledFace")) : ""}`;
      const className = classNames("g-advance__face", his(skill) && "g-advance__face--held", hits.has(face) && "g-advance__face--hit");
      return `<li class="${className}"${dataAttributes({ advanceFace: face })}>${faceInnerMarkup(face, skill)}${words}</li>`;
    });
    return `<ul class="g-advance__faces g-advance__faces--shown" aria-label="${label}">${items.join("")}</ul>`;
  }
  const full = sheet.marks.length >= diceCount(sheet, choices);
  const buttons = skillFaces(candidates).map(({ face, skill }) => {
    const on = sheet.marks.includes(face);
    const reason = on ? "" : skill === null ? t("teamAdvance.blank") : his(skill) ? t("teamAdvance.held") : full ? t("teamAdvance.marksFull") : "";
    const closed = reason ? ` aria-disabled="true" title="${escapeHtml(reason)}"` : "";
    return `<button type="button" class="${classNames("g-advance__face", his(skill) && "g-advance__face--held")}" aria-pressed="${on}"${closed}`
      + `${dataAttributes({ advanceFace: face, rosterClosed: Boolean(reason) })}>${faceInnerMarkup(face, skill)}</button>`;
  });
  return `<div class="g-advance__faces" role="group" aria-label="${label}">${buttons.join("")}</div>`;
}

/**
 * A card's die (Adv3Random; DeskRosterAdv): ui/die.mjs's in spans — a button holds no `div` (K10) — one picture to a
 * screen reader, named by its state: the face it came up, or not rolled (not marked) yet.
 */
function pickDieMarkup(face) {
  const rolled = face !== null;
  const label = rolled ? t("ui.die.rolled", { type: "D16", value: face }) : t("ui.die.waiting", { type: "D16" });
  return `<span class="${classNames("g-die", rolled && "g-die--rolled")}" role="img" aria-label="${escapeHtml(label)}">`
    + `<span class="g-die__type">D16</span><span class="g-die__value">${escapeHtml(rolled ? String(face) : "?")}</span></span>`;
}

/**
 * A random skill's pair (the owner's answer, 2026-10-20: the prototypes show one result): a radio group «The skills
 * rolled», a card for each die — its die and its skill, an elite combination's words — of which the coach takes one. A
 * die not in yet (no skill: before the roll, or not marked yet) is closed with the line under the way; one whose skill
 * he holds is struck through and closed, «has it already» (decision 35). An empty place is `die-1`, `die-2`: an empty
 * value would check the first place for no choice at all.
 * @param {{sheet: object, choices: object}} props
 */
export function pairMarkup({ sheet, choices }) {
  const waiting = noteWords(sheet, choices);
  const pair = pairOf(sheet, choices);
  // A skill chosen that has come to be his since (another device's save) is checked no more: its card is closed.
  const chosen = pair.some(({ skill, held }) => skill === sheet.skill && !held) ? sheet.skill : "";
  const items = pair.map(({ face, skill, held, elite }, at) => {
    const name = skill === null
      ? `<span aria-hidden="true">—</span><span class="g-sr-only">${escapeHtml(t("teamAdvance.blank"))}</span>` : escapeHtml(skill);
    const tag = elite && !held ? `<span class="g-advance__picktag">${escapeHtml(t("teamAdvance.elite"))}</span>` : "";
    return {
      value: skill ?? `die-${at + 1}`,
      className: classNames("g-advance__pick", held && "g-advance__pick--held"),
      data: { advancePick: skill ?? "" },
      reason: skill === null ? waiting : held ? t("teamAdvance.held") : "",
      html: `${pickDieMarkup(face)}<span class="g-advance__pickname">${name}</span>${tag}`,
    };
  });
  return radioGroupMarkup({ className: "g-advance__pair", label: t("teamAdvance.pairLabel"), chosen, items });
}

/** The line under the pair (Adv3Random's result): what the dice are rolled on until the pair is in, then that one is to be chosen, then the skill chosen. */
function resultWords(sheet, choices) {
  if (!pairWhole(sheet, choices)) return t("teamAdvance.rollResult");
  return chosenOf(sheet, choices)?.grant.skill ?? t("teamAdvance.pickPair");
}

/**
 * A random primary skill's roll (Adv3Random; DeskRosterAdv's third column): the way, the pair and its result — on a
 * desk «Roll two D16» under it, until the dice are in on the site (the owner's answer: none after the roll, none at the
 * table) — what the sheet says of the roll, «Record this roll…» for a stale roll a table advancement took a skill of,
 * the sixteen faces, and that the roll stays the player's.
 * @param {{sheet: object, choices: object, desk?: boolean}} props
 */
export function randomRollMarkup(props) {
  const { sheet, choices, desk = false } = props;
  const result = `<p class="g-advance__result">${escapeHtml(resultWords(sheet, choices))}</p>`;
  const button = desk && sheet.via === "site" && !sheet.roll ? rollButtonMarkup(props, t("teamAdvance.rollD16")) : "";
  const bind = bindable(sheet, choices) ? renderButton({ label: t("teamAdvance.bind", { skill: boundSkill(sheet, choices) }), data: { advanceBind: true } }) : "";
  return `<div class="g-advance__roll g-advance__roll--d16">${viaMarkup(props)}${pairMarkup(props)}${result}${button}`
    + `${alertsMarkup(sheet, choices)}${bind}${facesMarkup(props)}${keptMarkup(sheet)}</div>`;
}

/**
 * The D8's eight faces at the table (Adv3StatTable): any one may be pressed, and pressed again until the advancement is
 * taken — the one pressed checked, the arrows moving it and the focus staying on it (fix round 1, I1: Adv3StatTable hides
 * them once one is pressed, which leaves a keyboard only the first face its arrow lands on).
 */
function d8Markup(face) {
  const items = Array.from({ length: STAT_ROLL_TABLE.at(-1).to }, (_, at) => ({
    value: String(at + 1), className: "g-advance__d8face", data: { advanceD8: at + 1 }, reason: "", html: escapeHtml(String(at + 1)),
  }));
  return radioGroupMarkup({ className: "g-advance__d8", label: t("teamAdvance.d8Label"), items, chosen: face ? String(face) : "" });
}

/**
 * The characteristics the face offers (Adv3Stat): each as it is written now and after the +1, the +1's value; one past
 * its limits closed, its refusal in its place (decision 14).
 */
function statsMarkup(sheet, choices) {
  if (!choices.stats.length) return "";
  const items = choices.stats.map(({ stat, before, after, value, refusal }) => {
    const words = refusal ? refusalWordsOf("teamAdvance", refusal) : "";
    const change = words ? escapeHtml(words) : boldWords("teamAdvance.statOption", { before, after, value: formatMoney(value) }, ["after"], "g-advance__after");
    return {
      value: stat, className: "g-advance__stat", data: { advanceStat: stat }, reason: words,
      html: `<span class="g-advance__statkey">${escapeHtml(t(`stats.${stat}`))}</span><span class="g-advance__statchange">${change}</span>`,
    };
  });
  return radioGroupMarkup({ className: "g-advance__stats", label: t("teamAdvance.statsLabel"), items, chosen: sheet.stat });
}

/** The D8's table in a line (`STAT_ROLL_TABLE`): «1: AR · 2: AR/PA · … · 8: any» — a desk's without the colons (DeskRosterAdvStat). */
function d8TableWords(desk) {
  return STAT_ROLL_TABLE.map(({ from, to, stats }) => {
    const faces = from === to ? String(from) : `${from}–${to}`;
    const what = stats.length === PLAYER_STATS.length ? t("teamAdvance.d8Any") : stats.map((stat) => t(`stats.${stat}`)).join("/");
    return desk ? `${faces} ${what}` : `${faces}: ${what}`;
  }).join(" · ");
}

/** «Take a skill in place of the characteristic» (decision 13), at the characteristic's price. */
function insteadMarkup(choices) {
  return `<button type="button" class="g-advance__instead"${dataAttributes({ advanceInstead: true })}>`
    + `<b class="g-advance__insteadtitle">${escapeHtml(t("teamAdvance.instead"))}</b>`
    + `<span class="g-advance__insteadsub">${escapeHtml(t("teamAdvance.insteadSub", { cost: choices.offer?.cost ?? "" }))}</span></button>`;
}

/**
 * A characteristic's D8 (Adv3Stat, Adv3StatTable; DeskRosterAdvStat): the way; at the table its eight faces; the die;
 * on a phone what the face allows; what the sheet says of the roll; the characteristics with before and after; the D8's
 * table; once a face is in, «Take a skill in place of the characteristic»; and that the roll stays the player's. A desk splits it (`part`): its second column the roll — with «Roll D8» under the die — its third the choice.
 *
 * @param {{sheet: object, choices: object, desk?: boolean, part?: "all"|"roll"|"choice"}} props
 */
export function statRollMarkup(props) {
  const { sheet, choices, desk = false, part = "all" } = props;
  const choice = sheet.face ? `${statsMarkup(sheet, choices)}` : "";
  const instead = sheet.face ? insteadMarkup(choices) : "";
  if (part === "choice") return choice || instead ? `<div class="g-advance__roll">${choice}${instead}</div>` : "";
  const faces = sheet.via === "table" ? d8Markup(sheet.face) : "";
  const die = `<div class="g-advance__dice">${renderDie({ type: "D8", value: sheet.face })}</div>`;
  const stats = sheet.face ? statsForRoll(sheet.face).map((stat) => t(`stats.${stat}`)).join(", ") : "";
  const result = desk ? "" : `<p class="g-advance__result">${escapeHtml(stats ? t("teamAdvance.statResult", { stats }) : t("teamAdvance.statWait"))}</p>`;
  const button = desk && sheet.via === "site" && !sheet.roll ? rollButtonMarkup(props, t("teamAdvance.rollD8")) : "";
  const table = `<p class="g-advance__table">${escapeHtml(d8TableWords(desk))}</p>`;
  const rolled = `${viaMarkup(props)}${faces}${die}${result}${button}${alertsMarkup(sheet, choices)}`;
  if (part === "roll") return `<div class="g-advance__roll g-advance__roll--d8">${rolled}${table}${keptMarkup(sheet)}</div>`;
  return `<div class="g-advance__roll">${rolled}${choice}${table}${instead}${keptMarkup(sheet)}</div>`;
}

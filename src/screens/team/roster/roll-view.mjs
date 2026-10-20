/**
 * A roll in the advancement's sheet (Adv3Random, Adv3Stat, Adv3StatTable; DeskRosterAdv, DeskRosterAdvStat): on the site
 * the server's die, every attempt on a press, the sixteen faces of the Skill Table's column with his skills struck
 * through — a column shorter than the die has blank faces (owner, 2026-10-16); at the table the face the coach presses.
 * Once a roll is made on the site the type, the category and the way are fixed: the roll waits for the player until an
 * advancement of its kind takes it.
 *
 * The way is a segmented control over a line that says what happens; the die is ui/die.mjs's; the faces of the D16, the
 * faces of the D8 at the table and the characteristics a face offers are radio groups of the sheet's own
 * (radio-group.mjs's `radioGroupMarkup`): a face that cannot be pressed — every one on the site, a blank one or one of
 * his skills at the table — and a characteristic past its limits are closed, saying why on a press. What the sheet says
 * of the roll — the category it was made in, a roll of the other kind waiting, an answer lost, why it cannot be taken —
 * stands under the result. A phone's button is the sheet's (advance-sheet.mjs); a desk rolls in its column.
 *
 * Each function takes `{sheet, choices, desk}`: the sheet as the screen draws it (advance.mjs's, with why a roll is
 * closed, `rollReason`, and whether one is out, `busy`), what it offers him (`choicesOf`), and whether it is a desk's.
 * A skill's sheet says how an advancement gave the skill, with a site roll's attempts (`rollBlockMarkup`, Task 11).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { STAT_ROLL_TABLE, skillFaces, statsForRoll } from "../../../domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys } from "../../../domain/roster/players.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderDie } from "../../../ui/die.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderSegmentedControl } from "../../../ui/segmented-control.mjs";
import { bindable, keptWords, noteWords, rolledWords, waitingWords, wayFixed } from "./advance.mjs";
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
  return `${control}<p class="g-advance__note">${escapeHtml(noteWords(sheet))}</p>`;
}

/**
 * «Roll D16» or «Roll D8»: busy while the ask is out; closed, saying why — the roll made and the player's, the die the
 * table's (a desk keeps its «Roll D16» drawn, DeskRosterAdv), the screen's reason, a step of the queue that waits or is
 * on its way (decision 10), a roll of the other kind waiting (decision 11).
 * @param {{sheet: object}} props @param {string} label
 */
export function rollButtonMarkup({ sheet }, label) {
  const reason = rolledWords(sheet) || sheet.rollReason || waitingWords(sheet, sheet.type);
  return footButton({ label, kind: "primary", data: { advanceRoll: true }, busy: Boolean(sheet.busy), reason });
}

/** What one attempt of the die says: its face, and its skill, or why it was rolled again. */
function attemptWords({ roll: face, skill, duplicate }) {
  if (typeof skill !== "string") return t("teamAdvance.attempt.blank", { face });
  return duplicate ? t("teamAdvance.attempt.held", { face, skill }) : t("teamAdvance.attempt.kept", { face, skill });
}

/**
 * The attempts of a random skill's roll on the site (§9.5): «Attempts: N», which shows them on a press — each face, its
 * skill, and why it was rolled again — and hides them again (the advancement's sheet, `data-advance-attempts`). With
 * `toggle: false` (the skill's sheet, Task 11) «Attempts: N» is a caption and the list is always shown: nothing to press,
 * so no other sheet hears a press it cannot take. None for another roll.
 * @param {object|null} roll as the server answers it @param {{open?: boolean, toggle?: boolean}} [options]
 */
export function attemptsMarkup(roll, { open = false, toggle = true } = {}) {
  const tries = roll?.purpose === "random_skill" && Array.isArray(roll.result?.attempts) ? roll.result.attempts : [];
  if (!tries.length) return "";
  const id = `advance-attempts-${roll.id}`;
  const count = escapeHtml(t("teamAdvance.attempts", { count: tries.length }));
  const list = (named) => `<ol class="g-advance__attemptlist"${named ? ` id="${escapeHtml(id)}"` : ""}>`
    + `${tries.map((attempt) => `<li class="g-advance__attempt">${escapeHtml(attemptWords(attempt))}</li>`).join("")}</ol>`;
  if (!toggle) return `<p class="g-advance__attemptscaption">${count}</p>${list(false)}`;
  return `<button type="button" class="g-advance__attempts" aria-expanded="${open}"${open ? ` aria-controls="${escapeHtml(id)}"` : ""}${dataAttributes({ advanceAttempts: true })}>`
    + `${count}</button>${open ? list(true) : ""}`;
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
 * A site roll's attempts in the skill's sheet, as the visit read the team's rolls: the attempts only shown (`toggle:
 * false`), the skill's sheet having nothing to press — from the list read before while a read for another roll is on
 * its way (final wave, T11 N5); else while the read is on its way, when it failed, or when the site has no such roll of
 * his, said so. Nothing for an advancement not rolled on the site, nor for a D8 a skill took the place of (a
 * characteristic's: no attempts, so nothing is read for it — fix round 1).
 */
function siteRollMarkup(line, taken, rolls) {
  if (taken.via !== "site" || taken.type === "stat") return "";
  const roll = siteRollOf(rolls?.rolls, line, taken);
  if (roll) return attemptsMarkup(roll, { toggle: false });
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

/** The face a random skill's die shows: the site's last attempt, or the coach's at the table; null before. */
function randomFace(sheet) {
  if (sheet.via === "site") return sheet.roll?.result?.attempts?.at(-1)?.roll ?? null;
  return sheet.face ?? null;
}

/**
 * The sixteen faces of the D16 over the category's column (decision 12): the site's roll's own column, or at the table
 * the column as the Skill Table has it. Each its number and its skill, or «—» for a blank face; his skills struck
 * through, the face that came up on the accent. On the site the group only shows; at the table a face with a skill he
 * lacks is pressed.
 */
function facesMarkup({ sheet, choices }) {
  const site = sheet.via === "site";
  const candidates = site && sheet.roll ? sheet.roll.params?.candidates ?? [] : choices.skills.map(({ name }) => name);
  const held = choices.player ? heldSkillKeys(choices.player.row, choices.player) : new Set();
  const hit = randomFace(sheet);
  const items = skillFaces(candidates).map(({ face, skill }) => {
    const his = skill !== null && held.has(canonicalSkillName(skill));
    const reason = site ? noteWords(sheet) : skill === null ? t("teamAdvance.blank") : his ? t("teamAdvance.held") : "";
    const name = skill === null
      ? `<span aria-hidden="true">—</span><span class="g-sr-only">${escapeHtml(t("teamAdvance.blank"))}</span>` : escapeHtml(skill);
    return {
      value: String(face), reason, data: { advanceFace: face },
      className: classNames("g-advance__face", his && "g-advance__face--held", face === hit && "g-advance__face--hit"),
      html: `<span class="g-advance__facenum">${escapeHtml(String(face))}</span><span class="g-advance__facename">${name}</span>`,
    };
  });
  return radioGroupMarkup({ className: "g-advance__faces", label: t("teamAdvance.facesLabel"), items, chosen: hit === null ? "" : String(hit) });
}

/** The result under the die: what the category's table is rolled on, the skill — and how many times it was rolled again. */
function randomResult(sheet) {
  if (sheet.via === "site" && sheet.roll) {
    const { skill, attempts = [] } = sheet.roll.result;
    return attempts.length > 1 ? t("teamAdvance.rerolled", { skill, count: attempts.length - 1 }) : skill;
  }
  return sheet.via === "table" && sheet.face ? sheet.skill : t("teamAdvance.rollResult");
}

/**
 * A random primary skill's roll (Adv3Random; DeskRosterAdv's third column): the way, the D16 and its result — on a desk
 * with «Roll D16» beside the die — the attempts, what the sheet says of the roll, «Record this roll…» for a stale roll a
 * table advancement took the skill of, the sixteen faces, and that the roll stays the player's.
 * @param {{sheet: object, choices: object, desk?: boolean}} props
 */
export function randomRollMarkup(props) {
  const { sheet, choices, desk = false } = props;
  const die = renderDie({ type: "D16", value: randomFace(sheet) });
  const result = `<p class="g-advance__result">${escapeHtml(randomResult(sheet))}</p>`;
  // A desk's «Roll D16» stays beside the die, closed once there is nothing to roll (DeskRosterAdv; fix round 1, M1).
  const button = desk ? rollButtonMarkup(props, t("teamAdvance.rollD16")) : "";
  const head = desk ? `<div class="g-advance__dierow">${die}<div class="g-advance__dieside">${result}${button}</div></div>`
    : `<div class="g-advance__dice">${die}</div>${result}`;
  const attempts = sheet.via === "site" ? attemptsMarkup(sheet.roll, { open: sheet.attempts }) : "";
  const bind = bindable(sheet, choices) ? renderButton({ label: t("teamAdvance.bind", { skill: sheet.roll.result.skill }), data: { advanceBind: true } }) : "";
  return `<div class="g-advance__roll">${viaMarkup(props)}${head}${attempts}${alertsMarkup(sheet, choices)}${bind}${facesMarkup(props)}${keptMarkup(sheet)}</div>`;
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

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
 * Each markup function takes `{sheet, choices, desk}`: the sheet as the screen draws it (advance.mjs's, with why a
 * roll is closed, `rollReason`, and whether one is out, `busy`), what it offers him (`choicesOf`), and whether it is a
 * desk's. What the sheet says of its roll, and a random skill's pair as it stands (`pairOf`, `pickedDie`), are this
 * module's too — pure, of the sheet and its choices — which advance.mjs's presses read (T21 fix round 1, M6). A skill's
 * sheet says how an advancement gave the skill, and for a site roll what its dice showed (`rollBlockMarkup`).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { STAT_ROLL_TABLE, rolledDice, skillFaces, statsForRoll, tableAdvancementFor } from "../../../domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys } from "../../../domain/roster/players.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderDie } from "../../../ui/die.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderSegmentedControl } from "../../../ui/segmented-control.mjs";
import { boldWords } from "./panel.mjs";
import { radioGroupMarkup } from "./radio-group.mjs";
import { refusalWordsOf } from "./save.mjs";
import { footButton } from "./sheets.mjs";

/** The name the way's segmented control is wired by (wireSegmentedControls). */
export const VIA_GROUP = "advance-via";
/** The die each rolled type asks the server for (`POST …/rolls`' purpose). */
export const PURPOSE_OF = Object.freeze({ random: "random_skill", stat: "stat" });
/** «—» where a die or a face has no skill, kept from a screen reader, which hears what the place says instead. */
const NO_SKILL = '<span aria-hidden="true">—</span>';

/** How many dice a random skill's pair has (decisions 32–34): the site's roll's once made; else two, or one when the column holds a single skill he lacks. */
export function diceCount(sheet, choices) {
  if (sheet.via === "site" && sheet.roll) return Math.max(1, rolledDice(sheet.roll).length);
  return Math.min(2, Math.max(1, choices.skills.filter(({ held }) => !held).length));
}

/**
 * A random skill's pair as the sheet stands, `diceCount` long: on the site the roll's dice (`rolledDice`); at the table
 * the faces marked, in the order marked, each with the column's skill on it; then a place for each die not in yet —
 * before a roll on the site, every one. A die says whether he holds its skill (`heldSkillKeys`, by canonical name) and
 * whether it would complete an elite combination (the column's).
 * @param {object} sheet @param {{skills: object[], player: object|null}} choices
 * @returns {{face: number|null, skill: string|null, held: boolean, elite: boolean}[]}
 */
export function pairOf(sheet, choices) {
  const held = choices.player ? heldSkillKeys(choices.player.row, choices.player) : new Set();
  const die = (face, skill) => ({ face, skill, held: skill !== null && held.has(canonicalSkillName(skill)),
    elite: skill !== null && Boolean(choices.skills.find(({ name }) => canonicalSkillName(name) === canonicalSkillName(skill))?.elite) });
  const dice = sheet.via === "site" ? rolledDice(sheet.roll).map(({ face, skill }) => die(face, skill))
    : (sheet.marks ?? []).map((face) => die(face, choices.skills[face - 1]?.name ?? null));
  return Array.from({ length: diceCount(sheet, choices) }, (_, at) => dice[at] ?? die(null, null));
}

/** Whether a random skill's pair is in: the site's roll made, or at the table a face marked for each die. */
export function pairWhole(sheet, choices) {
  return sheet.via === "site" ? Boolean(sheet.roll) : (sheet.marks ?? []).length === diceCount(sheet, choices);
}

/** The die of the pair the coach has chosen — one whose skill he lacks, the pair whole (a choice does not outlive its pair, M2) — or null. */
export function pickedDie(sheet, choices) {
  if (!pairWhole(sheet, choices)) return null;
  return pairOf(sheet, choices).find(({ skill, held }) => skill !== null && skill === sheet.skill && !held) ?? null;
}

/** The skill a roll of a single die gives at once (decision 34); "" for two dice, or none. */
export const soleSkill = (roll) => (rolledDice(roll).length === 1 ? rolledDice(roll)[0].skill : "");

/** Whether the die is one: a characteristic's D8, or a random skill's column with a single skill he lacks (decision 34, M3). */
const oneDie = (sheet, choices) => sheet.type === "stat" || diceCount(sheet, choices) === 1;

/** Why a type of the other kind than the roll that waits for the player cannot be rolled (409 `DICE_ROLL_WAITING`, decision 11); "" for any other. */
export function waitingWords(sheet, type) {
  const purpose = PURPOSE_OF[type];
  return purpose && sheet.waiting && purpose !== sheet.waiting ? t(`teamAdvance.waiting.${sheet.waiting}`) : "";
}

/** Why the type (and a random skill's category) can no longer change: a roll on the site is made for this sheet, and stays the player's (decision 9). */
export function keptWords(sheet) {
  return sheet.roll ? t("teamAdvance.kept") : "";
}

/** Why the site's roll cannot be taken as it is (`rollRefusal`), "" when it can or the way is the table: «Take» closed whichever die is chosen. */
export function siteRefusedWords(sheet, choices) {
  return sheet.via === "site" && sheet.roll && choices.rollRefused ? refusalWordsOf("teamAdvance", choices.rollRefused) : "";
}

/**
 * Whether the way the roll is made is fixed: a roll is made on the site, and the player can take it as it is. One that
 * cannot be taken — `ROLL_STALE`, `ROLL_REROLLED`, whose words say «or take this advancement at the table» — leaves the
 * table open (decision 11; fix round 1, I2): the site's roll keeps waiting for the player either way.
 */
export function wayFixed(sheet, choices) {
  return Boolean(sheet.roll) && !choices.rollRefused;
}

/**
 * The line under the way: what the site does — the die, or a random skill's two dice — what to do at the table, or how
 * the roll was made: at the table once the D8's face or the whole pair is in (K8). A single die is said as one (M3).
 */
function noteWords(sheet, choices) {
  if (sheet.via === "site") {
    if (sheet.roll) return t("teamAdvance.note.rolledSite");
    return oneDie(sheet, choices) ? t("teamAdvance.note.siteDie") : t("teamAdvance.note.site");
  }
  if (sheet.type === "stat") return sheet.face ? t("teamAdvance.note.rolledTable") : t("teamAdvance.note.tableD8");
  if (pairWhole(sheet, choices)) return t("teamAdvance.note.rolledTable");
  return oneDie(sheet, choices) ? t("teamAdvance.note.tableOne") : t("teamAdvance.note.table");
}

/**
 * Why «Roll two D16» or «Roll D8» has nothing to roll, "" when it has: the roll is made and stays the player's, or the
 * dice are the table's. Neither is drawn then (the owner's answer): a press that reaches it all the same is told so.
 */
export function rolledWords(sheet, choices) {
  if (sheet.roll && sheet.via === "site") return keptWords(sheet);
  return sheet.via === "table" ? noteWords(sheet, choices) : "";
}

/**
 * Whether the site's roll can be put on the random advancement taken at the table that gave one of its dice's skills
 * (`tableAdvancementFor`, T1 review Minor 4): only a stale one, both skills his (decision 35; K9: as the plan).
 */
export function bindable(sheet, choices) {
  return sheet.via === "site" && choices.rollRefused?.code === "ROLL_STALE" && tableAdvancementFor(sheet.roll, choices.player) >= 0;
}

/** The skill of the table advancement a stale roll is put on (`tableAdvancementFor`): what «Record this roll…» and its toast name (K8). */
export function boundSkill(sheet, choices) {
  return choices.player?.advancements?.[tableAdvancementFor(sheet.roll, choices.player)]?.grants?.skill ?? "";
}

/** What «Roll …» says: «Roll D8», a random skill's «Roll two D16» — «Roll D16» for a single die (M3). */
export function rollLabel(sheet, choices) {
  if (sheet.type === "stat") return t("teamAdvance.rollD8");
  return oneDie(sheet, choices) ? t("teamAdvance.rollOneD16") : t("teamAdvance.rollD16");
}

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

/** The line of the skill's sheet that says what the site's roll showed: its dice's skills (`diceWords`); none for a roll that shows none. */
const rollPairMarkup = (words) => (words ? `<p class="g-roster__rollpair">${escapeHtml(words)}</p>` : "");

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
 * What a random skill's roll on the site showed, in a line: «Rolled: A and B» for its two dice, «Rolled: A» for one (a
 * column that held a single skill the player lacked, or a roll kept before there were two dice) — the skills in the order
 * of the dice (`rolledDice`). Empty for a roll that shows no skill; the faces and the attempts are not said (decision 39).
 * @param {object|null} roll as the server answers it
 */
function diceWords(roll) {
  const [first, second] = rolledDice(roll).map(({ skill }) => skill);
  if (second !== undefined) return t("teamPlayer.roll.pair", { first, second });
  return first === undefined ? "" : t("teamPlayer.roll.one", { skill: first });
}

/**
 * What a site roll showed in the skill's sheet, as the visit read the team's rolls (`diceWords`) — from the list read
 * before while a read for another roll is on its way (final wave, T11 N5); else while the read is on its way, when it
 * failed, or when the site has no such roll of his, said so. Nothing for an advancement not rolled on the site, nor for
 * a D8 a skill took the place of (a characteristic's: no dice to say, so nothing is read for it — fix round 1).
 */
function siteRollMarkup(line, taken, rolls) {
  if (taken.via !== "site" || taken.type === "stat") return "";
  const roll = siteRollOf(rolls?.rolls, line, taken);
  if (roll) return rollPairMarkup(diceWords(roll));
  if (!rolls || rolls.loading) return rollStateMarkup(t("teamPlayer.roll.reading"));
  if (rolls.error) return rollStateMarkup(t("teamPlayer.roll.failed", { reason: rolls.error }), true);
  return rollStateMarkup(t("teamPlayer.roll.none"));
}

/**
 * How an advancement gave a skill, in the skill's sheet (decision 19; StatsSkill.html has none): «Advancement 1 · Random
 * primary skill · rolled on the site» — a chosen one without the way — and for a site roll what its dice showed
 * (`siteRollMarkup`), the roll read once a visit (player.mjs). Nothing for a skill no advancement gave.
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
  const [waiting, refused] = [waitingWords(sheet, sheet.type), siteRefusedWords(sheet, choices)];
  return [
    category && sheet.asked && category !== sheet.asked ? line(t("teamAdvance.otherCategory", { category }), true) : "",
    waiting ? line(waiting) : "",
    sheet.lost ? line(t("teamAdvance.lost")) : "",
    refused ? line(refused) : "",
  ].join("");
}

/** «The roll stays the player's…», once one is made on the site. */
const keptMarkup = (sheet) => (sheet.roll ? `<p class="g-advance__kept">${escapeHtml(keptWords(sheet))}</p>` : "");

/** A face's number and its skill, or «—» for a blank face, which a screen reader hears as «no skill». */
function faceInnerMarkup(face, skill) {
  const name = skill === null ? `${NO_SKILL}<span class="g-sr-only">${escapeHtml(t("teamAdvance.blank"))}</span>` : escapeHtml(skill);
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
 * screen reader, named by its state: the face it came up, not rolled yet on the site, not marked yet at the table (M5).
 */
function pickDieMarkup(face, table) {
  const rolled = face !== null;
  const label = rolled ? t("ui.die.rolled", { type: "D16", value: face }) : table ? t("teamAdvance.dieUnmarked") : t("ui.die.waiting", { type: "D16" });
  return `<span class="${classNames("g-die", rolled && "g-die--rolled")}" role="img" aria-label="${escapeHtml(label)}">`
    + `<span class="g-die__type">D16</span><span class="g-die__value">${escapeHtml(rolled ? String(face) : "?")}</span></span>`;
}

/**
 * A random skill's pair (the owner's answer, 2026-10-20: the prototypes show one result): a radio group «The skills
 * rolled», a card for each die — its die and its skill, an elite combination's words — of which the coach takes one. Until
 * the pair is whole every card is closed with the line under the way — a die not in yet («—», its die named not rolled
 * or not marked yet, M5), and a die marked while the other is not (M2) — and nothing is checked; a die whose skill he
 * holds is struck through and closed, «has it already» (decision 35). An empty place is `die-1`, `die-2`: an empty
 * value would check the first place for no choice at all.
 * @param {{sheet: object, choices: object}} props
 */
export function pairMarkup({ sheet, choices }) {
  const [waiting, whole, table] = [noteWords(sheet, choices), pairWhole(sheet, choices), sheet.via === "table"];
  const items = pairOf(sheet, choices).map(({ face, skill, held, elite }, at) => {
    const tag = elite && !held ? `<span class="g-advance__picktag">${escapeHtml(t("teamAdvance.elite"))}</span>` : "";
    return {
      value: skill ?? `die-${at + 1}`,
      className: classNames("g-advance__pick", held && "g-advance__pick--held"),
      data: { advancePick: skill ?? "" },
      reason: skill === null ? waiting : held ? t("teamAdvance.held") : whole ? "" : waiting,
      html: `${pickDieMarkup(face, table)}<span class="g-advance__pickname">${skill === null ? NO_SKILL : escapeHtml(skill)}</span>${tag}`,
    };
  });
  return radioGroupMarkup({ className: "g-advance__pair", label: t("teamAdvance.pairLabel"), chosen: pickedDie(sheet, choices)?.skill ?? "", items });
}

/** The line under the pair (Adv3Random's result): what the dice are rolled on until the pair is in — a single die said as one (M3) — then that one is to be chosen, then the skill chosen. */
function resultWords(sheet, choices) {
  if (!pairWhole(sheet, choices)) return oneDie(sheet, choices) ? t("teamAdvance.rollResultOne") : t("teamAdvance.rollResult");
  return pickedDie(sheet, choices)?.skill ?? t("teamAdvance.pickPair");
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
  const button = desk && sheet.via === "site" && !sheet.roll ? rollButtonMarkup(props, rollLabel(sheet, choices)) : "";
  const bind = bindable(sheet, choices) ? renderButton({ label: t("teamAdvance.bind", { skill: boundSkill(sheet, choices) }), data: { advanceBind: true } }) : "";
  // The result and a desk's button under it, 6 apart as DeskRosterAdv's side column (M10).
  return `<div class="g-advance__roll g-advance__roll--d16">${viaMarkup(props)}${pairMarkup(props)}<div class="g-advance__outcome">${result}${button}</div>`
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
  const button = desk && sheet.via === "site" && !sheet.roll ? rollButtonMarkup(props, rollLabel(sheet, choices)) : "";
  const table = `<p class="g-advance__table">${escapeHtml(d8TableWords(desk))}</p>`;
  const rolled = `${viaMarkup(props)}${faces}${die}${result}${button}${alertsMarkup(sheet, choices)}`;
  if (part === "roll") return `<div class="g-advance__roll g-advance__roll--d8">${rolled}${table}${keptMarkup(sheet)}</div>`;
  return `<div class="g-advance__roll">${rolled}${choice}${table}${instead}${keptMarkup(sheet)}</div>`;
}

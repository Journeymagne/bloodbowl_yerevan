/**
 * The advancement's sheet in its two looks: a phone's steps with their dots and «Back», a desk's three columns with the
 * summary at the foot.
 *
 * A phone (Adv1Type, Adv2Category, Adv3Skill, Adv4Done): the types as cards, each with its price at his next rank and
 * what it adds to his value — or why it is refused; then the type's categories, each with how many of its skills he
 * lacks; then the category's skills in the Skill Table's order, his own marked and closed; then done — what he got, what
 * it cost and adds, his advancements now, and where the save stands. A desk (DeskRosterAdv.html): his number before the
 * title, the three choices side by side, a column waiting for the one before it saying so, the choice summed up at the
 * foot by «Cancel» and «Take»; done in the window, the save's state in the summary. Under done, on both, a roster
 * «Favoured of…» is offered the god's bonus skill (decision 17, Task 11).
 *
 * A random skill and a characteristic are rolled (Adv3Random, Adv3Stat, Adv3StatTable; DeskRosterAdv, DeskRosterAdvStat):
 * a phone's third step is the D16's, its second the D8's, its button «Roll D16» or «Roll D8» until the die is in, then
 * «Take: …» or «Improve …»; a desk's third column is the D16's, and a characteristic's second the D8's and its third the
 * characteristic it improves. A skill in place of a characteristic walks the category and the skill as a chosen one.
 * The roll's own markup is roll-view.mjs's.
 *
 * The types are a `renderOptionList`; the categories, the skills, the faces and the characteristics radio groups of
 * their own (`role="radiogroup"`, a roving tabindex, wireRadioGroups), whose closed items say why on a press as the
 * roster's closed controls do (K7).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { ADVANCEMENT_TYPES } from "../../../domain/roster/progression.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderOptionList } from "../../../ui/option-card.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { CHOSEN_TYPES, bonusOf, choicesOf, chosenOf, keptWords, refusedWords, stepBefore, waitingWords } from "./advance.mjs";
import { closedMarkup, prepResetWords } from "./panel.mjs";
import { radioGroupMarkup } from "./radio-group.mjs";
import { randomRollMarkup, rollButtonMarkup, statRollMarkup } from "./roll-view.mjs";
import { rollAsking } from "./rolls.mjs";
import { refusalWordsOf } from "./save.mjs";
import { ADVANCE_SHEET, footButton } from "./sheets.mjs";

/** The frame every sheet of a player's wears (player-sheets.css). */
const FRAME = "g-player-sheet";
/** The Skill Table's categories with a colour of their own (`--cat-*`). */
const COLOURED = Object.freeze(["agility", "devious", "general", "mutation", "passing", "strength"]);
/** Each step's dot on a phone; done fills them all. */
const PLACES = Object.freeze({ type: 1, category: 2, skill: 3, stat: 2 });

/**
 * The types as cards (Adv1Type.html): the price at his next rank in the pill; under the name what it draws from and adds
 * to his value — a characteristic's D8 — or why it is refused (decision 8: his SPP, the last rank, a roll of the other
 * kind waiting), closed and saying so on a press (K7). Once a roll is made on the site every type is closed, saying why
 * on a press (decision 9). Offers not known yet (K28): the names alone, none refused.
 */
function typesMarkup(sheet, choices) {
  const kept = keptWords(sheet);
  const shut = (reason) => ({ disabled: true, reason, data: { rosterClosed: true } });
  const options = ADVANCEMENT_TYPES.map((type) => {
    const offer = choices.offers.find((each) => each.type === type);
    const card = { value: type, title: t(`teamAdvance.type.${type}`) };
    const waiting = waitingWords(sheet, type);
    if (!offer) return kept || waiting ? { ...card, ...shut(kept || waiting) } : card;
    const pill = t("teamAdvance.pill", { cost: offer.cost });
    const refused = offer.refusal ? refusalWordsOf("teamAdvance", offer.refusal) : waiting;
    if (refused) return { ...card, pill, sub: refused, ...shut(refused) };
    const categories = offer.categories.map(({ category }) => category).join(", ");
    const sub = type === "stat" ? t("teamAdvance.statSub") : t("teamAdvance.typeSub", { categories, value: formatMoney(offer.value) });
    return { ...card, pill, sub, ...(kept ? shut(kept) : {}) };
  });
  return renderOptionList({ label: t("teamAdvance.typesLabel"), options, selected: sheet.type });
}

/** A category's letter on its colour (Adv2Category.html); the name beside it is what a screen reader reads. */
function letterMarkup(category) {
  const colour = category.toLowerCase();
  const className = classNames("g-advance__letter", COLOURED.includes(colour) && `g-advance__letter--${colour}`);
  return `<span class="${className}" aria-hidden="true">${escapeHtml(category.charAt(0))}</span>`;
}

/**
 * The type's categories (Adv2Category.html): the letter, the name, how many of its skills he lacks; one with none closed,
 * and a random skill's every one once its roll is made on the site (decision 9). None to show (offers not known yet,
 * K28) is nothing: a desk's column then says what it waits for.
 */
function categoriesMarkup(sheet, choices) {
  if (!choices.categories.length) return "";
  const kept = sheet.type === "random" ? keptWords(sheet) : "";
  const items = choices.categories.map(({ category, free, total }) => ({
    value: category, className: "g-advance__cat", data: { advanceCategory: category }, reason: free ? kept : t("teamAdvance.refusal.NO_SKILL_LEFT"),
    html: `${letterMarkup(category)}<span class="g-advance__catwords"><span class="g-advance__catname">${escapeHtml(category)}</span>`
      + `<span class="g-advance__free">${escapeHtml(t("teamAdvance.free", { free, total }))}</span></span>`,
  }));
  return radioGroupMarkup({ className: "g-advance__cats", label: t("teamAdvance.categoriesLabel"), items, chosen: sheet.category });
}

/**
 * The category's skills in the Skill Table's order (Adv3Skill.html, a desk's grid): his own «has it already» and closed,
 * one that would complete an elite combination saying what it adds, the chosen one «chosen».
 */
function skillsMarkup(sheet, choices) {
  const tag = (kind, words) => `<span class="g-advance__tag g-advance__tag--${kind}">${escapeHtml(words)}</span>`;
  const items = choices.skills.map(({ name, held, elite }) => {
    const tags = held ? tag("held", t("teamAdvance.held"))
      : `${elite ? tag("elite", t("teamAdvance.elite")) : ""}${name === sheet.skill ? tag("picked", t("teamAdvance.picked")) : ""}`;
    return {
      value: name, className: "g-advance__skill", data: { advanceSkill: name }, reason: held ? t("teamAdvance.held") : "",
      html: `<span class="g-advance__skillname">${escapeHtml(name)}</span>${tags ? `<span class="g-advance__tags">${tags}</span>` : ""}`,
    };
  });
  return radioGroupMarkup({ className: "g-advance__skills", label: t("teamAdvance.skillsLabel"), items, chosen: sheet.skill });
}

/**
 * Where the save of the advancement stands, in the roster's words; a desk's «Saved» says where it went (DeskRosterAdv.html).
 * A queue at rest (IDLE: the server's roster taken since) with the advancement in his line (`held`) has it saved.
 */
function savedWords({ status, waiting }, { desk = false, held = false } = {}) {
  if (status === SAVE_STATUS.SAVING || status === SAVE_STATUS.DIRTY) return t("teamRoster.status.saving");
  if (status === SAVE_STATUS.SAVED || (status === SAVE_STATUS.IDLE && held)) return t(desk ? "teamAdvance.savedDesk" : "teamRoster.status.saved");
  if (status === SAVE_STATUS.OFFLINE) return t("teamRoster.status.waiting", { count: waiting });
  return status === SAVE_STATUS.CONFLICT || status === SAVE_STATUS.ERROR ? t("teamRoster.status.unsaved") : "";
}

/**
 * The done step (Adv4Done.html; DeskRosterAdv.html's advDone): the tick, what he got and how — on a phone the tiles of
 * what it cost, what it adds to his value and his advancements now, on a desk the same in the line under the title — an
 * elite combination's 15k when it is one, and on a phone where the save stands (a desk's summary says it).
 *
 * @param {import("./model.mjs").PlayerLine} line @param {import("./view.mjs").RosterScreen} screen
 * @param {{title: string, how: string, cost: number, value: number, elite: boolean, level: number, ownTitle: boolean}} taken
 *   `ownTitle`: a characteristic's «MA 6 → 7», which a desk's title says as it is (DeskRosterAdvStat)
 */
function doneMarkup(line, screen, taken) {
  const { phone } = screen;
  const [spp, value] = [`−${taken.cost}`, `+${formatMoney(taken.value)}`];
  const title = phone || taken.ownTitle ? taken.title : t("teamAdvance.doneTitleDesk", { name: line.name, skill: taken.title });
  const how = phone ? taken.how : t("teamAdvance.doneLineDesk", { how: taken.how, spp, value });
  const tile = (key, words) => `<div class="g-advance__tile"><dt class="g-advance__tilekey">${escapeHtml(key)}</dt><dd class="g-advance__tilevalue">${escapeHtml(words)}</dd></div>`;
  const tiles = phone ? `<dl class="g-advance__tiles">${tile(t("teamRoster.group.spp"), spp)}${tile(t("teamAdvance.doneValue"), value)}`
    + `${tile(t("teamAdvance.doneLevel"), t("teamAdvance.doneLevelOf", { level: taken.level }))}</dl>` : "";
  const elite = taken.elite ? `<p class="g-advance__elite">${escapeHtml(t("teamAdvance.doneElite"))}</p>` : "";
  const status = phone ? `<p class="g-advance__status" role="status">${escapeHtml(savedWords(screen.save, { held: line.level >= taken.level }))}</p>` : "";
  return `<div class="g-advance__done"><span class="g-advance__check" aria-hidden="true">${icon("check", 30)}</span>`
    + `<h3 class="g-advance__donetitle">${escapeHtml(title)}</h3><p class="g-advance__how">${escapeHtml(how)}</p>${tiles}${elite}${status}</div>`;
}

/**
 * The god's bonus skill under done (decision 17, owner's answer 3; no prototype — Adv4Done's done step, the skills as
 * Adv3Skill's): a roster «Favoured of…» rolls a D8 at the table with an advancement, and on its number the player gains
 * one of the god's skills at no cost to the value — chosen, or without Mutation in the primary access rolled for at the
 * table too. The skills are a radio group, his own closed and saying so; «Add …» once one is chosen, closed while the
 * screen is (`sheet.reason`), with the last refusal under it. None for a roster with no favour, nor once it is added.
 * @param {object} sheet the done step's, with `bonus` the skill chosen and `favoured` "added" once added
 * @param {ReturnType<typeof bonusOf>} bonus
 */
function favouredMarkup(sheet, bonus) {
  if (!bonus || sheet.favoured === "added") return "";
  const held = `<span class="g-advance__tags"><span class="g-advance__tag g-advance__tag--held">${escapeHtml(t("teamAdvance.held"))}</span></span>`;
  const items = bonus.skills.map(({ name, held: his }) => ({
    value: name, className: "g-advance__skill", data: { favouredSkill: name }, reason: his ? t("teamPlayer.favoured.held") : "",
    html: `<span class="g-advance__skillname">${escapeHtml(name)}</span>${his ? held : ""}`,
  }));
  const chosen = sheet.bonus ?? "";
  const label = chosen ? t("teamPlayer.favoured.add", { skill: chosen }) : t("teamPlayer.favoured.pick");
  const add = sheet.reason ? closedMarkup({ className: "g-btn", label, reason: sheet.reason, data: { favouredAdd: true } })
    : renderButton({ label, disabled: !chosen, data: { favouredAdd: true } });
  const line = (words) => `<p class="g-favoured__line">${escapeHtml(words)}</p>`;
  const alert = sheet.refusal ? `<p class="g-player-sheet__refusal" role="alert">${escapeHtml(sheet.refusal)}</p>` : "";
  return `<section class="g-favoured"><h3 class="g-favoured__title">${escapeHtml(t("teamPlayer.favoured.title", { alignment: bonus.alignment }))}</h3>`
    + `${line(t("teamPlayer.favoured.sub", { trigger: bonus.trigger }))}${bonus.random ? line(t("teamPlayer.favoured.random")) : ""}`
    + `${radioGroupMarkup({ className: "g-advance__skills g-favoured__skills", label: t("teamPlayer.favoured.label"), items, chosen })}${add}${alert}</section>`;
}

/** Until it is taken: what a save resets during a preparation (R12), and the last refusal of «Take». */
function linesMarkup(screen, sheet) {
  if (sheet.step === "done") return "";
  const prep = screen.mode.kind === "prep" ? `<p class="g-player-sheet__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const alert = sheet.refusal ? `<p class="g-player-sheet__refusal" role="alert">${escapeHtml(sheet.refusal)}</p>` : "";
  return prep || alert ? `<div class="g-advance__lines">${prep}${alert}</div>` : "";
}

/** What «Take» says of the advancement chosen: «Take Diving Catch», a roll's «Take: Frenzy», a characteristic's «Improve MA». */
function takeLabel(chosen) {
  if (chosen.grant.stat) return t("teamAdvance.improve", { stat: t(`stats.${chosen.grant.stat}`) });
  return chosen.type === "random" ? t("teamAdvance.accept", { skill: chosen.grant.skill }) : t("teamAdvance.take", { skill: chosen.grant.skill });
}

/**
 * What «Take» waits for: a skill, the face the coach saw on the D16 (a desk: «Roll first», DeskRosterAdv), the D8's
 * result at the table (a desk: the characteristic, DeskRosterAdvStat), a characteristic.
 */
function waitLabel(sheet, desk) {
  if (sheet.type === "random") return desk || sheet.via === "site" ? t("teamAdvance.rollFirst") : t("teamAdvance.pickFace");
  if (sheet.type !== "stat" || sheet.instead) return t("teamAdvance.pickSkill");
  return !desk && sheet.via === "table" && !sheet.face ? t("teamAdvance.pickD8") : t("teamAdvance.pickStat");
}

/**
 * «Take …», or what it waits for, shut while the choice is not whole; closed — the screen's reason (`reason`), the type
 * chosen refused since, a roll of the other kind waiting, a site roll the player cannot take as it is (`rollRefusal`)
 * — it says why. A press is still the domain's to refuse, in words in the sheet (advance.mjs).
 */
function takeMarkup(sheet, choices, { desk = false } = {}) {
  const chosen = chosenOf(sheet, choices);
  const stale = chosen?.siteRoll && choices.rollRefused ? refusalWordsOf("teamAdvance", choices.rollRefused) : "";
  const reason = sheet.reason || refusedWords(sheet, choices) || stale;
  return footButton({ label: chosen ? takeLabel(chosen) : waitLabel(sheet, desk), kind: "primary", data: { advanceTake: true }, disabled: !reason && !chosen, reason });
}

/** A phone's title and the line under it, by its step (Adv2Category…Adv3Stat; a skill in place of a characteristic, DeskRosterAdvStat's words). */
function phoneHead(line, sheet, choices) {
  const cost = choices.offer?.cost ?? "";
  if (sheet.step === "done") return [t("teamAdvance.doneTitle"), line.name];
  if (sheet.step === "category") {
    return [t("teamAdvance.categoryTitle"), sheet.instead ? t("teamAdvance.insteadTitle", { cost }) : t("teamAdvance.categorySub", { type: t(`teamAdvance.type.${sheet.type}`), cost })];
  }
  if (sheet.step === "skill") return [sheet.type === "random" ? t("teamAdvance.randomTitle") : t("teamAdvance.skillTitle"), t("teamAdvance.skillSub", { category: sheet.category, cost })];
  if (sheet.step === "stat") return [t("teamAdvance.statTitle"), t("teamAdvance.statSubLine", { cost })];
  return [t("teamAdvance.title"), t("teamAdvance.sub", { spp: line.available, next: line.level + 1 })];
}

/** A rolled step's button on a phone (Adv3Random, Adv3Stat): «Roll D16» or «Roll D8» on the site until the die is in, then «Take»'s. */
function rolledFoot(sheet, choices) {
  if (sheet.via === "site" && !sheet.roll) return rollButtonMarkup({ sheet }, sheet.type === "stat" ? t("teamAdvance.rollD8") : t("teamAdvance.rollD16"));
  return takeMarkup(sheet, choices);
}

/**
 * A phone's step (Adv1Type…Adv4Done, Adv3Random, Adv3Stat, Adv3StatTable): its body, and its one button — «Next» once a
 * choice is made (closed, saying why, when the type chosen is refused since), «Roll …», «Take», «Back to the player».
 */
function phoneParts(line, screen, sheet, choices) {
  const next = (ready) => {
    const reason = refusedWords(sheet, choices);
    return footButton({ label: t("teamAdvance.next"), kind: "primary", data: { advanceNext: true }, disabled: !reason && !ready, reason });
  };
  const listed = CHOSEN_TYPES.includes(sheet.type) || sheet.instead;
  switch (sheet.step) {
    case "type": return [typesMarkup(sheet, choices), next(Boolean(choices.offer))];
    case "category": {
      const hint = sheet.type === "random" ? t("teamAdvance.randomHint") : t("teamAdvance.chosenHint");
      return [`${categoriesMarkup(sheet, choices)}<p class="g-advance__hint">${escapeHtml(hint)}</p>`, next(Boolean(sheet.category))];
    }
    case "skill": {
      if (listed) return [skillsMarkup(sheet, choices), takeMarkup(sheet, choices)];
      return sheet.type === "random" ? [randomRollMarkup({ sheet, choices }), rolledFoot(sheet, choices)] : ["", ""];
    }
    case "stat": return [statRollMarkup({ sheet, choices }), rolledFoot(sheet, choices)];
    case "done": {
      const bodyHtml = `${doneMarkup(line, screen, sheet.taken)}${favouredMarkup(sheet, bonusOf(line, screen))}`;
      return [bodyHtml, renderButton({ label: t("teamAdvance.back"), kind: "primary", data: { advanceDone: true } })];
    }
    default: return ["", ""];
  }
}

/**
 * A phone's sheet from the bottom: the step's title, its dots — 3 for a skill, 2 for a characteristic, 3 for a skill in
 * its place — and «Back» past the first, unless the die has come up (`stepBefore`).
 */
function phoneMarkup(line, screen, sheet, choices) {
  const [title, sub] = phoneHead(line, sheet, choices);
  const [bodyHtml, footHtml] = phoneParts(line, screen, sheet, choices);
  const total = sheet.type === "stat" && !sheet.instead ? 2 : 3;
  return renderSheet({
    id: ADVANCE_SHEET,
    className: FRAME,
    title,
    sub,
    step: { current: PLACES[sheet.step] ?? total, total },
    canGoBack: Boolean(stepBefore(sheet)),
    bodyHtml: `${bodyHtml}${linesMarkup(screen, sheet)}`,
    footHtml,
  });
}

/** A column of the desk's window (DeskRosterAdv.html): its caption, then what it holds, or what it waits for. */
function columnMarkup(caption, bodyHtml, waiting = "") {
  const inside = bodyHtml || `<p class="g-advance__empty">${escapeHtml(waiting)}</p>`;
  return `<section class="${classNames("g-advance__col", !bodyHtml && "g-advance__col--empty")}"><h3 class="g-advance__coltitle">${escapeHtml(caption)}</h3>${inside}</section>`;
}

/** The desk's summary at the foot: the choice so far and its price (DeskRosterAdv.html, DeskRosterAdvStat.html), or what to choose first. */
function summaryWords(sheet, choices) {
  if (!sheet.type) return t("teamAdvance.pickType");
  const { grant } = chosenOf(sheet, choices) ?? {};
  const what = [t(`teamAdvance.type.${sheet.type}`), sheet.category, grant?.stat ? t(`stats.${grant.stat}`) : grant?.skill].filter(Boolean).join(" · ");
  return choices.offer ? t("teamAdvance.summary", { what, cost: choices.offer.cost }) : what;
}

/**
 * A desk's three columns (DeskRosterAdv.html, DeskRosterAdvStat.html): the types; the categories, or a characteristic's
 * D8 — the way, the faces at the table, the die, «Roll D8»; the skills, a random skill's roll, or the characteristic the
 * D8 allows. A skill in place of a characteristic: its categories and skills.
 */
function columnsMarkup(sheet, choices) {
  const props = { sheet, choices, desk: true };
  const rolled = sheet.type === "stat" && !sheet.instead;
  // A skill in place of the characteristic goes back to it from the categories (fix round 1, M2): the type stays a
  // characteristic, so its card is no way back (DeskRosterAdvStat's, which makes the type a chosen one, is).
  const back = sheet.instead ? `<button type="button" class="g-advance__back"${dataAttributes({ advanceStatback: true })}>${escapeHtml(t("teamAdvance.backToStat"))}</button>` : "";
  const second = rolled ? columnMarkup(t("teamAdvance.col.d8"), statRollMarkup({ ...props, part: "roll" }))
    : columnMarkup(t("teamAdvance.col.category"), sheet.type ? `${back}${categoriesMarkup(sheet, choices)}` : "", t("teamAdvance.col.emptyType"));
  return `<div class="g-advance__cols">${columnMarkup(t("teamAdvance.col.type"), typesMarkup(sheet, choices))}${second}${thirdColumn(props, rolled)}</div>`;
}

/** A desk's third column: the characteristic the D8 allows, a random skill's roll, or the category's skills. */
function thirdColumn(props, rolled) {
  const { sheet, choices } = props;
  if (rolled) return columnMarkup(t("teamAdvance.col.stat"), statRollMarkup({ ...props, part: "choice" }), t("teamAdvance.col.emptyD8"));
  if (sheet.type === "random") return columnMarkup(t("teamAdvance.col.roll"), sheet.category ? randomRollMarkup(props) : "", t("teamAdvance.col.emptyCategory"));
  const listed = sheet.category && (CHOSEN_TYPES.includes(sheet.type) || sheet.instead);
  return columnMarkup(t("teamAdvance.col.skill"), listed ? skillsMarkup(sheet, choices) : "", t("teamAdvance.col.emptyCategory"));
}

/**
 * A desk's window (DeskRosterAdv.html): his number before «Advancement · name», his SPP, his next advancement and his
 * position under it; the three columns, or done; the summary and «Cancel» with «Take» at the foot — done, the save's
 * state and «Done».
 */
function deskMarkup(line, screen, sheet, choices) {
  const done = sheet.step === "done";
  const columns = done ? "" : columnsMarkup(sheet, choices);
  const saved = done && savedWords(screen.save, { desk: true, held: line.level >= sheet.taken.level });
  const summary = done ? `<p class="g-advance__summary" role="status">${escapeHtml(saved)}</p>`
    : `<p class="g-advance__summary">${escapeHtml(summaryWords(sheet, choices))}</p>`;
  return renderSheet({
    id: ADVANCE_SHEET,
    className: FRAME,
    title: t("teamAdvance.titleDesk", { name: line.name }),
    sub: t("teamAdvance.subDesk", { spp: line.available, next: line.level + (done ? 0 : 1), position: line.position }),
    leadHtml: renderPlayerBadge({ number: line.number, kind: line.kind }),
    bodyHtml: `${done ? `${doneMarkup(line, screen, sheet.taken)}${favouredMarkup(sheet, bonusOf(line, screen))}` : columns}${linesMarkup(screen, sheet)}`,
    footStartHtml: summary,
    footHtml: done ? renderButton({ label: t("teamAdvance.finish"), kind: "primary", data: { advanceDone: true } })
      : `${renderButton({ label: t("teamAdvance.cancel"), data: { advanceKeep: true } })}${takeMarkup(sheet, choices, { desk: true })}`,
  });
}

/**
 * The advancement's sheet (decision 8): a phone's steps, or a desk's window.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player, on the roster
 * @param {import("./view.mjs").RosterScreen} props.screen
 * @param {object} props.sheet the visit's (advance.mjs), with why «Take» and a roll are closed just now (`reason`,
 *   `rollReason`); drawn busy while its roll is asked (`asking`, or the player's ask still out: `rollAsking`)
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#player-advance")` opens it
 */
export function advanceSheetMarkup({ line, screen, sheet }) {
  const shown = { ...sheet, busy: Boolean(sheet.asking) || rollAsking(screen.teamId, line.id) };
  const choices = choicesOf(line, shown, screen);
  return screen.phone ? phoneMarkup(line, screen, shown, choices) : deskMarkup(line, screen, shown, choices);
}

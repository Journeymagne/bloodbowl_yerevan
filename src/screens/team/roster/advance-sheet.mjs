/**
 * The advancement's sheet in its two looks: a phone's steps with their dots and «Back», a desk's three columns with the
 * summary at the foot.
 *
 * A phone (Adv1Type, Adv2Category, Adv3Skill, Adv4Done): the types as cards, each with its price at his next rank and
 * what it adds to his value — or why it is refused; then the type's categories, each with how many of its skills he
 * lacks; then the category's skills in the Skill Table's order, his own marked and closed; then done — what he got, what
 * it cost and adds, his advancements now, and where the save stands. A desk (DeskRosterAdv.html): his number before the
 * title, the three choices side by side, a column waiting for the one before it saying so, the choice summed up at the
 * foot by «Cancel» and «Take»; done in the window, the save's state in the summary.
 *
 * The types are a `renderOptionList`; the categories and the skills radio groups of their own (`role="radiogroup"`, a
 * roving tabindex, wireRadioGroups), whose closed items say why on a press as the roster's closed controls do (K7). A
 * random skill's roll and a characteristic's D8 are Task 10's: their steps draw nothing here yet.
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
import { CHOSEN_TYPES, STEP_BEFORE, choicesOf, chosenOf } from "./advance.mjs";
import { prepResetWords } from "./panel.mjs";
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
 * to his value — a characteristic's D8 — or why it is refused, closed and saying so on a press (K7). Offers not known
 * yet (K28): the names alone, none refused.
 */
function typesMarkup(sheet, choices) {
  const options = ADVANCEMENT_TYPES.map((type) => {
    const offer = choices.offers.find((each) => each.type === type);
    const card = { value: type, title: t(`teamAdvance.type.${type}`) };
    if (!offer) return card;
    const pill = t("teamAdvance.pill", { cost: offer.cost });
    if (offer.refusal) {
      const words = refusalWordsOf("teamAdvance", offer.refusal);
      return { ...card, pill, sub: words, disabled: true, reason: words, data: { rosterClosed: true } };
    }
    const categories = offer.categories.map(({ category }) => category).join(", ");
    return { ...card, pill, sub: type === "stat" ? t("teamAdvance.statSub") : t("teamAdvance.typeSub", { categories, value: formatMoney(offer.value) }) };
  });
  return renderOptionList({ label: t("teamAdvance.typesLabel"), options, selected: sheet.type });
}

/**
 * A radio group of the sheet's own (constraints, «Радиогруппы»): its items buttons with `role="radio"`, the chosen one —
 * else the first open one, else the first — in the tab order; a closed one `aria-disabled`, its reason its title, said
 * on a press (`data-roster-closed`, K7).
 * @param {{className: string, label: string, chosen: string,
 *   items: {value: string, className: string, data: object, reason: string, html: string}[]}} props `html` is markup
 */
function radioGroupMarkup({ className, label, items, chosen }) {
  const checked = items.findIndex(({ value }) => value === chosen);
  const entry = [checked, items.findIndex(({ reason }) => !reason), 0].find((index) => index >= 0);
  const buttons = items.map((item, index) => {
    const closed = item.reason ? ` aria-disabled="true" title="${escapeHtml(item.reason)}"` : "";
    return `<button type="button" class="${item.className}" role="radio" aria-checked="${index === checked}" tabindex="${index === entry ? 0 : -1}"${closed}`
      + `${dataAttributes({ ...item.data, rosterClosed: Boolean(item.reason) })}>${item.html}</button>`;
  });
  return `<div class="${className}" role="radiogroup" aria-label="${escapeHtml(label)}">${buttons.join("")}</div>`;
}

/** A category's letter on its colour (Adv2Category.html); the name beside it is what a screen reader reads. */
function letterMarkup(category) {
  const colour = category.toLowerCase();
  const className = classNames("g-advance__letter", COLOURED.includes(colour) && `g-advance__letter--${colour}`);
  return `<span class="${className}" aria-hidden="true">${escapeHtml(category.charAt(0))}</span>`;
}

/** The type's categories (Adv2Category.html): the letter, the name, how many of its skills he lacks; one with none closed. */
function categoriesMarkup(sheet, choices) {
  const items = choices.categories.map(({ category, free, total }) => ({
    value: category, className: "g-advance__cat", data: { advanceCategory: category }, reason: free ? "" : t("teamAdvance.refusal.NO_SKILL_LEFT"),
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

/** Where the save of the advancement stands, in the roster's words; a desk's «Saved» says where it went (DeskRosterAdv.html). */
function savedWords({ status, waiting }, { desk = false } = {}) {
  if (status === SAVE_STATUS.SAVING || status === SAVE_STATUS.DIRTY) return t("teamRoster.status.saving");
  if (status === SAVE_STATUS.SAVED) return t(desk ? "teamAdvance.savedDesk" : "teamRoster.status.saved");
  if (status === SAVE_STATUS.OFFLINE) return t("teamRoster.status.waiting", { count: waiting });
  return status === SAVE_STATUS.CONFLICT || status === SAVE_STATUS.ERROR ? t("teamRoster.status.unsaved") : "";
}

/**
 * The done step (Adv4Done.html; DeskRosterAdv.html's advDone): the tick, what he got and how — on a phone the tiles of
 * what it cost, what it adds to his value and his advancements now, on a desk the same in the line under the title — an
 * elite combination's 15k when it is one, and on a phone where the save stands (a desk's summary says it).
 *
 * @param {import("./model.mjs").PlayerLine} line @param {import("./view.mjs").RosterScreen} screen
 * @param {{title: string, how: string, cost: number, value: number, elite: boolean, level: number}} taken
 */
function doneMarkup(line, screen, taken) {
  const { phone } = screen;
  const [spp, value] = [`−${taken.cost}`, `+${formatMoney(taken.value)}`];
  const title = phone ? taken.title : t("teamAdvance.doneTitleDesk", { name: line.name, skill: taken.title });
  const how = phone ? taken.how : t("teamAdvance.doneLineDesk", { how: taken.how, spp, value });
  const tile = (key, words) => `<div class="g-advance__tile"><dt class="g-advance__tilekey">${escapeHtml(key)}</dt><dd class="g-advance__tilevalue">${escapeHtml(words)}</dd></div>`;
  const tiles = phone ? `<dl class="g-advance__tiles">${tile(t("teamRoster.group.spp"), spp)}${tile(t("teamAdvance.doneValue"), value)}`
    + `${tile(t("teamAdvance.doneLevel"), t("teamAdvance.doneLevelOf", { level: taken.level }))}</dl>` : "";
  const elite = taken.elite ? `<p class="g-advance__elite">${escapeHtml(t("teamAdvance.doneElite"))}</p>` : "";
  const status = phone ? `<p class="g-advance__status" role="status">${escapeHtml(savedWords(screen.save))}</p>` : "";
  return `<div class="g-advance__done"><span class="g-advance__check" aria-hidden="true">${icon("check", 30)}</span>`
    + `<h3 class="g-advance__donetitle">${escapeHtml(title)}</h3><p class="g-advance__how">${escapeHtml(how)}</p>${tiles}${elite}${status}</div>`;
}

/** Until it is taken: what a save resets during a preparation (R12), and the last refusal of «Take». */
function linesMarkup(screen, sheet) {
  if (sheet.step === "done") return "";
  const prep = screen.mode.kind === "prep" ? `<p class="g-player-sheet__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const alert = sheet.refusal ? `<p class="g-player-sheet__refusal" role="alert">${escapeHtml(sheet.refusal)}</p>` : "";
  return prep || alert ? `<div class="g-advance__lines">${prep}${alert}</div>` : "";
}

/** «Take {skill}», or «Choose a skill» shut while the choice is not whole; closed (`reason`), it says why. */
function takeMarkup(sheet, choices) {
  const chosen = chosenOf(sheet, choices);
  const label = chosen ? t("teamAdvance.take", { skill: chosen.grant.skill }) : t("teamAdvance.pickSkill");
  const reason = sheet.reason ?? "";
  return footButton({ label, kind: "primary", data: { advanceTake: true }, disabled: !reason && !chosen, reason });
}

/** A phone's title and the line under it, by its step. */
function phoneHead(line, sheet, choices) {
  const cost = choices.offer?.cost ?? "";
  if (sheet.step === "done") return [t("teamAdvance.doneTitle"), line.name];
  if (sheet.step === "category") return [t("teamAdvance.categoryTitle"), t("teamAdvance.categorySub", { type: t(`teamAdvance.type.${sheet.type}`), cost })];
  if (sheet.step === "skill") return [t("teamAdvance.skillTitle"), t("teamAdvance.skillSub", { category: sheet.category, cost })];
  return [t("teamAdvance.title"), t("teamAdvance.sub", { spp: line.available, next: line.level + 1 })];
}

/** A phone's step (Adv1Type…Adv4Done): its body, and its one button — «Next» once a choice is made, «Take», «Back to the player». */
function phoneParts(line, screen, sheet, choices) {
  const next = (disabled) => renderButton({ label: t("teamAdvance.next"), kind: "primary", data: { advanceNext: true }, disabled });
  const chosenType = CHOSEN_TYPES.includes(sheet.type);
  switch (sheet.step) {
    case "type": return [typesMarkup(sheet, choices), next(!choices.offer)];
    case "category": {
      const hint = chosenType ? `<p class="g-advance__hint">${escapeHtml(t("teamAdvance.chosenHint"))}</p>` : "";
      return [`${categoriesMarkup(sheet, choices)}${hint}`, next(!sheet.category)];
    }
    case "skill": return chosenType ? [skillsMarkup(sheet, choices), takeMarkup(sheet, choices)] : ["", ""];
    case "done": return [doneMarkup(line, screen, sheet.taken), renderButton({ label: t("teamAdvance.back"), kind: "primary", data: { advanceDone: true } })];
    default: return ["", ""];
  }
}

/** A phone's sheet from the bottom: the step's title, its dots — 3 for a skill, 2 for a characteristic — and «Back» past the first. */
function phoneMarkup(line, screen, sheet, choices) {
  const [title, sub] = phoneHead(line, sheet, choices);
  const [bodyHtml, footHtml] = phoneParts(line, screen, sheet, choices);
  const total = sheet.type === "stat" ? 2 : 3;
  return renderSheet({
    id: ADVANCE_SHEET,
    className: FRAME,
    title,
    sub,
    step: { current: PLACES[sheet.step] ?? total, total },
    canGoBack: Boolean(STEP_BEFORE[sheet.step]),
    bodyHtml: `${bodyHtml}${linesMarkup(screen, sheet)}`,
    footHtml,
  });
}

/** A column of the desk's window (DeskRosterAdv.html): its caption, then what it holds, or what it waits for. */
function columnMarkup(caption, bodyHtml, waiting = "") {
  const inside = bodyHtml || `<p class="g-advance__empty">${escapeHtml(waiting)}</p>`;
  return `<section class="${classNames("g-advance__col", !bodyHtml && "g-advance__col--empty")}"><h3 class="g-advance__coltitle">${escapeHtml(caption)}</h3>${inside}</section>`;
}

/** The desk's summary at the foot: the choice so far and its price (DeskRosterAdv.html), or what to choose first. */
function summaryWords(sheet, choices) {
  if (!sheet.type) return t("teamAdvance.pickType");
  const what = [t(`teamAdvance.type.${sheet.type}`), sheet.category, chosenOf(sheet, choices)?.grant.skill].filter(Boolean).join(" · ");
  return choices.offer ? t("teamAdvance.summary", { what, cost: choices.offer.cost }) : what;
}

/**
 * A desk's window (DeskRosterAdv.html): his number before «Advancement · name», his SPP, his next advancement and his
 * position under it; the three columns, or done; the summary and «Cancel» with «Take» at the foot — done, the save's
 * state and «Done».
 */
function deskMarkup(line, screen, sheet, choices) {
  const done = sheet.step === "done";
  const columns = `<div class="g-advance__cols">${columnMarkup(t("teamAdvance.col.type"), typesMarkup(sheet, choices))}`
    + columnMarkup(t("teamAdvance.col.category"), sheet.type ? categoriesMarkup(sheet, choices) : "", t("teamAdvance.col.emptyType"))
    + columnMarkup(t("teamAdvance.col.skill"), sheet.category && CHOSEN_TYPES.includes(sheet.type) ? skillsMarkup(sheet, choices) : "", t("teamAdvance.col.emptyCategory"))
    + "</div>";
  const summary = done ? `<p class="g-advance__summary" role="status">${escapeHtml(savedWords(screen.save, { desk: true }))}</p>`
    : `<p class="g-advance__summary">${escapeHtml(summaryWords(sheet, choices))}</p>`;
  return renderSheet({
    id: ADVANCE_SHEET,
    className: FRAME,
    title: t("teamAdvance.titleDesk", { name: line.name }),
    sub: t("teamAdvance.subDesk", { spp: line.available, next: line.level + (done ? 0 : 1), position: line.position }),
    leadHtml: renderPlayerBadge({ number: line.number, kind: line.kind }),
    bodyHtml: `${done ? doneMarkup(line, screen, sheet.taken) : columns}${linesMarkup(screen, sheet)}`,
    footStartHtml: summary,
    footHtml: done ? renderButton({ label: t("teamAdvance.finish"), kind: "primary", data: { advanceDone: true } })
      : `${renderButton({ label: t("teamAdvance.cancel"), data: { advanceKeep: true } })}${takeMarkup(sheet, choices)}`,
  });
}

/**
 * The advancement's sheet (decision 8): a phone's steps, or a desk's window.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player, on the roster
 * @param {import("./view.mjs").RosterScreen} props.screen
 * @param {object} props.sheet the visit's (advance.mjs), with why «Take» is closed just now (`reason`)
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#player-advance")` opens it
 */
export function advanceSheetMarkup({ line, screen, sheet }) {
  const choices = choicesOf(line, sheet, screen);
  return screen.phone ? phoneMarkup(line, screen, sheet, choices) : deskMarkup(line, screen, sheet, choices);
}

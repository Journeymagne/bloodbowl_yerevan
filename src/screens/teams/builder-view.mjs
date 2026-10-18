/**
 * The builder's screen: the second step of `#/teams/new`, drawn from a draft
 * (domain/roster/build.mjs) and wired to handlers that change it.
 *
 * Everything here is markup and the clicks on it. Which race, the draft, the
 * redraw after a change, the request that saves the team are `new.mjs`'s; the
 * rules (what a position's limit is, what the staff costs, when the squad may
 * be saved) are the build's, and this screen only asks them. That is why the
 * reason a «+» is refused is the build's own refusal, asked of a copy of the
 * draft, and not a second copy of its test.
 *
 * The page is in the order a phone reads it: the head and the budget, the team,
 * the players, the numbers, the staff, then the save. From 901px builder.css puts
 * the blocks in two columns without reordering the markup, so a keyboard walks
 * the desk's columns in the phone's order.
 */
import { delegate, escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { teamsUrl } from "../../core/routes.mjs";
import { builderStaffCosts, medicalStaffDefinitions, rosterSizeLimits, startingBudget } from "../../domain/league-rules.mjs";
import { BUILD_STAFF_KEYS, buildTotals, hirePlayer, staffAvailable, stepStaff } from "../../domain/roster/build.mjs";
import { rowCountInPlayers } from "../../domain/roster/players.mjs";
import { teamFavouredOptions, teamLeagueOptions } from "../../domain/roster/team-rules.mjs";
import { PLAYER_STATS, costToNumber, countToNumber, rosterMax, rowCost, rowsForTeam, statValueForDisplayByStat } from "../../domain/roster/values.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { icon } from "../../ui/icons.mjs";
import { classNames } from "../../ui/markup.mjs";
import { renderOptionList, wireOptionLists } from "../../ui/option-card.mjs";
import { renderResourceCounter, wireResourceCounters } from "../../ui/resource-counter.mjs";
import { renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { renderStepButton, wireStepButtons } from "../../ui/stepper.mjs";
import { renderToggle, wireToggles } from "../../ui/toggle.mjs";

const CHOICE_ID = "new-team-choice";
const ROSTER_ID = "new-team-roster";
const LOGO_ID = "new-team-logo";
const CHOICE_KINDS = ["league", "favoured"];
/** The word «Captain» for a screen reader, once on the page: every captain radio's name starts with it. */
const CAPTAIN_WORD_ID = "new-team-captain-label";
/** The ids of a player's row, each followed by his id. */
const CAPTAIN_PREFIX = { name: "new-team-name-", position: "new-team-position-", radio: "new-team-captain-" };

/** A picture a coach picked, and nothing else, is drawn as one; the optimiser may turn a PNG into a WebP. */
const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,/;

/** The staff the build sells as a switch, not a count: a medic is bought once. */
const isMedic = (key) => medicalStaffDefinitions.some((staff) => staff.key === key);

/** What a staff is called: the dictionary's word for the counted ones, the rule table's title for a medic. */
function staffTitle(key) {
  switch (key) {
    case "startingRerolls": return t("savedRoster.startingRerolls");
    case "dedicatedFans": return t("savedRoster.dedicatedFans");
    case "assistantCoaches": return t("savedRoster.assistantCoaches");
    case "cheerleaders": return t("savedRoster.cheerleaders");
    case "bribes": return t("savedRoster.bribes");
    default: return medicalStaffDefinitions.find((staff) => staff.key === key)?.title ?? key;
  }
}

/**
 * A refusal of the build, `{ code, params }`, in words. The staff codes carry
 * the staff's `key` and the dictionary's sentence wants its `title`, so the
 * title is looked up from the key here; left to the caller it would show as
 * a literal "{title}".
 *
 * @param {{code: string, params?: object}} refusal what hirePlayer or stepStaff returned
 */
export function buildRefusalText({ code, params = {} }) {
  return t(`validation.${code}`, params.key ? { ...params, title: staffTitle(params.key) } : params);
}

/** Why a «+» on this row would be refused, asked of the build on a copy: the screen cannot disagree with the rule, and drawing hires nobody. */
function hireRefusal(race, draft, rowIndex) {
  return hirePlayer(race, { ...draft, players: [...draft.players] }, rowIndex);
}

function staffRefusal(race, draft, key) {
  return stepStaff(race, { ...draft }, key, 1);
}

// ---------------------------------------------------------------------------
// The head and the budget
// ---------------------------------------------------------------------------

function headMarkup(race, name) {
  const back = `<a class="g-icon-btn" href="${escapeHtml(teamsUrl())}" data-history-back data-history-fallback="${escapeHtml(teamsUrl())}" aria-label="${escapeHtml(t("teams.title"))}">${icon("back", 18)}</a>`;
  const titles = `<div class="g-build__titles"><h1 class="g-build__title" tabindex="-1">${escapeHtml(name || race.title)}</h1>`
    + `<p class="g-build__sub">${escapeHtml(t("newTeam.subtitle", { race: race.title }))}</p></div>`;
  return `<header class="g-build__head" data-key="build-head">${back}${titles}${renderStatusChip({ label: t("teams.stage.draft"), onDark: true })}`
    + `${renderButton({ label: t("newTeam.restart"), data: { newTeamRestart: true } })}</header>`;
}

/** The bar fills in steps of ten: no inline width (the CSP), and a sliver of spending shows. */
function barStep(totals) {
  if (totals.over) return 100;
  if (!totals.total) return 0;
  return Math.max(10, Math.round((totals.total / startingBudget) * 10) * 10);
}

/** "Budget 600k": the figure is the bold part. */
const figure = (label, amount) => `<span>${escapeHtml(label)} <b>${escapeHtml(formatMoney(amount))}</b></span>`;

function budgetMarkup(totals) {
  const over = totals.over > 0;
  const spent = `${t("newTeam.spent")} ${formatMoney(totals.total)}`;
  const bar = `<div class="${classNames("g-build__bar", `g-build__bar--${barStep(totals)}`, over && "g-build__bar--over")}" role="progressbar" aria-label="${escapeHtml(t("newTeam.budgetAria"))}"`
    + ` aria-valuemin="0" aria-valuemax="${startingBudget}" aria-valuenow="${Math.min(totals.total, startingBudget)}" aria-valuetext="${escapeHtml(spent)}"></div>`;
  const rows = [["players", totals.playersCost], ["staff", totals.staffCost], ["total", totals.total]]
    .map(([part, amount]) => `<div><dt>${escapeHtml(t(`newTeam.totals.${part}`))}</dt><dd>${escapeHtml(formatMoney(amount))}</dd></div>`)
    .join("");
  return '<div class="g-build__budget" data-key="build-budget"><div class="g-build__budget-card">'
    + `<div class="g-build__figures">${figure(t("newTeam.budget"), startingBudget)}${figure(t("newTeam.spent"), totals.total)}</div>`
    + `<div class="${classNames("g-build__remains", over && "g-build__remains--over")}"><span class="g-build__left">${escapeHtml(formatMoney(Math.abs(totals.left)))}</span>`
    + `<span class="g-build__left-label">${escapeHtml(over ? t("newTeam.over") : t("newTeam.left"))}</span></div>`
    + `${bar}<dl class="g-build__totals">${rows}</dl></div></div>`;
}

// ---------------------------------------------------------------------------
// The team: race, league, favoured alignment, logo
// ---------------------------------------------------------------------------

/** What a sheet of this kind offers; nothing for a kind the screen does not know. */
function choiceOptions(race, kind) {
  if (kind === "league") return teamLeagueOptions(race);
  if (kind === "favoured") return teamFavouredOptions(race);
  return [];
}

/** A line of the team's card; a value that can be chosen from two or more has the button that opens the choice. */
function choiceRow(kind, label, value, options) {
  const change = options.length >= 2
    ? `<button type="button" class="g-btn g-build__change" data-new-team-choice="${kind}" aria-describedby="new-team-${kind}-label">${escapeHtml(t("newTeam.change"))}</button>`
    : "";
  return `<div class="g-build__row"><span class="g-build__label" id="new-team-${kind}-label">${escapeHtml(label)}</span>`
    + `<span class="g-build__value"><b>${escapeHtml(value)}</b>${change}</span></div>`;
}

function logoRow(logoData) {
  const picture = LOGO_DATA_URL.test(logoData) ? `<img src="${escapeHtml(logoData)}" alt="">` : icon("shield", 18);
  const remove = LOGO_DATA_URL.test(logoData) ? renderButton({ label: t("savedRoster.removeLogo"), data: { newTeamLogoRemove: true } }) : "";
  return `<div class="g-build__row g-build__row--logo"><span class="g-build__logo-line"><span class="g-build__logo">${picture}</span>`
    + `<span class="g-build__logo-text"><span class="g-build__logo-name">${escapeHtml(t("newTeam.logo"))}</span><span class="g-build__hint">${escapeHtml(t("newTeam.logoNote"))}</span></span></span>`
    + `<span class="g-build__logo-actions"><input class="g-sr-only g-build__file" type="file" id="${LOGO_ID}" accept="image/png,image/jpeg">`
    + `<label class="g-btn g-build__upload" for="${LOGO_ID}">${escapeHtml(t("newTeam.upload"))}</label>${remove}</span></div>`;
}

function teamMarkup(race, draft) {
  const leagues = teamLeagueOptions(race);
  const alignments = teamFavouredOptions(race);
  const tier = race.team?.meta?.league;
  const rows = [`<div class="g-build__row"><span class="g-build__label">${escapeHtml(t("newTeam.race"))}</span><span class="g-build__value"><b>${escapeHtml(tier ? `${race.title} · ${tier}` : race.title)}</b></span></div>`];
  if (leagues.length) rows.push(choiceRow("league", t("newTeam.league"), draft.selectedLeague, leagues));
  if (alignments.length) rows.push(choiceRow("favoured", t("roster.favouredOf"), draft.favouredChoice, alignments));
  rows.push(logoRow(String(draft.logoData ?? "")));
  return '<section class="g-build__team" data-key="build-team" aria-labelledby="new-team-team-title">'
    + `<div class="g-build__sec-head"><h2 class="g-build__h" id="new-team-team-title">${escapeHtml(t("newTeam.teamHeading"))}</h2></div>${rows.join("")}</section>`;
}

/** The sheet that picks a league or an alignment, or nothing when there is nothing to pick from. */
function choiceSheet(race, draft, choice) {
  const options = CHOICE_KINDS.includes(choice) ? choiceOptions(race, choice) : [];
  if (options.length < 2) return "";
  const league = choice === "league";
  const title = league ? t("newTeam.league") : t("roster.favouredOf");
  const list = renderOptionList({
    label: title,
    options: options.map((value) => ({ value, title: value, radio: true })),
    selected: league ? draft.selectedLeague : draft.favouredChoice,
  });
  return renderSheet({ id: CHOICE_ID, title, bodyHtml: `<div data-choice-kind="${choice}">${list}</div>` });
}

// ---------------------------------------------------------------------------
// The players
// ---------------------------------------------------------------------------

/** The colour of a position's letter, by what it does on the pitch; whatever is not named is a lineman's grey. */
const POSITION_KINDS = [["Big Guy", "big"], ["Thrower", "thrower"], ["Catcher", "catcher"], ["Blitzer", "blitzer"]];

function positionKind(row) {
  const tags = row.tags ?? [];
  return POSITION_KINDS.find(([tag]) => tags.includes(tag))?.[1] ?? "lineman";
}

const statsLine = (row) => PLAYER_STATS.map((stat) => `${t(`stats.${stat}`)} ${statValueForDisplayByStat(stat, row[stat])}`).join(" · ");

function hireRow(race, draft, totals, row, rowIndex) {
  const count = rowCountInPlayers(draft, rowIndex);
  const max = rosterMax(row.qty);
  const price = costToNumber(rowCost(row));
  const refusal = hireRefusal(race, draft, rowIndex);
  const minus = renderStepButton({ hook: "hire", delta: -1, label: t("newTeam.drop", { position: row.position }), disabled: count <= 0, className: "g-hire__btn" });
  // A position dearer than what is left is greyed and still bought: going over the budget is allowed, and shown.
  const plus = renderStepButton({
    hook: "hire",
    delta: 1,
    label: t("newTeam.hire", { position: row.position }),
    blockedReason: refusal ? buildRefusalText(refusal) : "",
    className: classNames("g-hire__btn", "g-hire__inc", price > totals.left && "g-hire__inc--poor"),
  });
  const skills = (row.skills ?? []).join(", ") || t("newTeam.noSkills");
  return `<div class="g-hire" data-key="hire-${rowIndex}" data-hire-key="${rowIndex}">`
    + `<span class="g-hire__avatar g-hire__avatar--${positionKind(row)}" aria-hidden="true">${escapeHtml(Array.from(row.position)[0] ?? "")}</span>`
    + `<span class="g-hire__text"><b class="g-hire__name">${escapeHtml(row.position)}</b>`
    + `<span class="g-hire__line"><span class="g-hire__price">${escapeHtml(formatMoney(price))}</span>`
    + `<span class="${classNames("g-hire__limit", count >= max && "g-hire__limit--max")}">${escapeHtml(t("newTeam.positionLimit", { count, max }))}</span></span>`
    + `<span class="g-hire__stats">${escapeHtml(statsLine(row))}</span><span class="g-hire__skills">${escapeHtml(skills)}</span></span>`
    + `<span class="g-hire__stepper">${minus}<span class="g-hire__count">${count}</span>${plus}</span></div>`;
}

function playersMarkup(race, draft, totals) {
  const line = t("newTeam.playersLine", { count: totals.count, max: rosterSizeLimits.max, min: rosterSizeLimits.min });
  const rows = rowsForTeam(race).map((row, rowIndex) => hireRow(race, draft, totals, row, rowIndex)).join("");
  return '<section class="g-build__players" data-key="build-players" aria-labelledby="new-team-players-title"><div class="g-build__sec-head">'
    + `<h2 class="g-build__h" id="new-team-players-title">${escapeHtml(t("newTeam.players"))}</h2>`
    + `<span class="${classNames("g-build__count", totals.short > 0 && "g-build__count--short")}">${escapeHtml(line)}</span></div>${rows}</section>`;
}

// ---------------------------------------------------------------------------
// Numbers, names and the captain
// ---------------------------------------------------------------------------

/**
 * One player's row. The ids are built from the player's id (generated: no whitespace in it), so that the
 * captain radio can be named by the word «Captain», the player's name and his position (aria-labelledby),
 * and the group can own it. The word is in each name because Safari does not follow aria-owns: there a radio
 * is read without its group, and "Brandt Human Lineman, radio button" would not say what choosing it does.
 */
function rosterRow(player, row, entry) {
  const id = escapeHtml(player.id);
  return `<div class="g-roster-row" data-key="player-${id}">`
    + `<label class="g-roster-row__num"><span aria-hidden="true">#</span><input class="g-roster-row__number" type="number" min="1" max="99" inputmode="numeric" value="${escapeHtml(player.number)}" data-player-number="${id}" aria-label="${escapeHtml(t("newTeam.number"))}"></label>`
    + `<span class="g-roster-row__who"><input class="g-roster-row__name" type="text" id="${CAPTAIN_PREFIX.name}${id}" value="${escapeHtml(player.name)}" placeholder="${escapeHtml(row.position)}" data-player-name="${id}" aria-label="${escapeHtml(t("newTeam.playerName"))}">`
    + `<span class="g-roster-row__position" id="${CAPTAIN_PREFIX.position}${id}">${escapeHtml(row.position)}</span></span>`
    // The visible «C» is a design glyph, the same in the Russian prototype, and not text: the radio is named by its player.
    + `<button type="button" class="g-roster-row__captain" id="${CAPTAIN_PREFIX.radio}${id}" role="radio" aria-checked="${Boolean(player.isCaptain)}" tabindex="${entry ? 0 : -1}" data-captain="${id}" aria-labelledby="${CAPTAIN_WORD_ID} ${CAPTAIN_PREFIX.name}${id} ${CAPTAIN_PREFIX.position}${id}">C</button></div>`;
}

function rosterMarkup(race, draft, rosterOpen) {
  const rows = rowsForTeam(race);
  const players = (draft.players ?? []).filter((player) => rows[player.rowIndex]);
  // Nobody hired, nobody to number, name or make captain: no empty list under a heading.
  if (!players.length) return "";
  // Tab enters the group once: at the captain, or at the first when there is none.
  const entry = Math.max(0, players.findIndex((player) => player.isCaptain));
  const list = players.map((player, index) => rosterRow(player, rows[player.rowIndex], index === entry)).join("");
  const title = t("newTeam.roster", { count: players.length });
  const toggle = `<button type="button" class="g-build__roster-toggle" data-roster-toggle aria-expanded="${Boolean(rosterOpen)}" aria-controls="${ROSTER_ID}">`
    + `<span>${escapeHtml(rosterOpen ? t("newTeam.rosterHide") : title)}</span>${icon("down", 16)}</button>`;
  // The radio group owns the captain radios (aria-owns) and wraps nothing: the number and name fields sit in the
  // same list, and inside a radiogroup they would each be announced as "Captain, radio group".
  const word = `<span class="g-sr-only" id="${CAPTAIN_WORD_ID}">${escapeHtml(t("roster.captain"))}</span>`;
  const owner = `<div role="radiogroup" data-captains aria-label="${escapeHtml(t("roster.captain"))}" aria-owns="${players.map((player) => `${CAPTAIN_PREFIX.radio}${escapeHtml(player.id)}`).join(" ")}"></div>`;
  return '<section class="g-build__roster" data-key="build-roster">'
    + `<div class="g-build__sec-head g-build__roster-title"><h2 class="g-build__h">${escapeHtml(title)}</h2></div>${toggle}`
    + `<div class="${classNames("g-build__roster-list", !rosterOpen && "g-build__roster-list--shut")}" id="${ROSTER_ID}">${word}${owner}${list}</div></section>`;
}

// ---------------------------------------------------------------------------
// The staff
// ---------------------------------------------------------------------------

function staffCounter(race, draft, key) {
  const price = builderStaffCosts[key];
  const refusal = staffRefusal(race, draft, key);
  return renderResourceCounter({
    key,
    name: staffTitle(key),
    note: key === "dedicatedFans" ? t("newTeam.fansNote", { price }) : t("newTeam.price", { price }),
    value: countToNumber(draft[key]),
    incBlockedReason: refusal ? buildRefusalText(refusal) : "",
    // Of the counted staff only the bribes can be out of the race's reach.
    lockedReason: staffAvailable(race, key) ? "" : t("newTeam.bribesLocked"),
  });
}

function staffMarkup(race, draft) {
  const staff = BUILD_STAFF_KEYS.filter((key) => (isMedic(key) ? staffAvailable(race, key) : true)).map((key) => (isMedic(key)
    ? renderToggle({ key, label: staffTitle(key), caption: formatMoney(builderStaffCosts[key]), checked: countToNumber(draft[key]) > 0 })
    : staffCounter(race, draft, key)));
  const note = t("newTeam.rerollNote", { start: builderStaffCosts.startingRerolls, team: builderStaffCosts.teamRerolls });
  return '<section class="g-build__staff" data-key="build-staff" aria-labelledby="new-team-staff-title">'
    + `<div class="g-build__sec-head"><h2 class="g-build__h" id="new-team-staff-title">${escapeHtml(t("newTeam.staff"))}</h2></div>`
    + `${staff.join("")}<p class="g-build__reroll-note">${escapeHtml(note)}</p></section>`;
}

// ---------------------------------------------------------------------------
// The save
// ---------------------------------------------------------------------------

function ctaMarkup({ totals, named, pending, refusal }) {
  let label = t("newTeam.save", { total: totals.total });
  if (pending) label = t("newTeam.saving");
  else if (totals.over) label = t("newTeam.overBy", { over: totals.over });
  else if (totals.short) label = t("newTeam.short", { count: totals.short });
  let note = t("newTeam.noteShort", { min: rosterSizeLimits.min, max: rosterSizeLimits.max });
  if (totals.over) note = t("newTeam.noteOver", { budget: startingBudget });
  else if (totals.ready) note = t("newTeam.noteOk", { left: totals.left });
  const alert = refusal ? `<div role="alert">${renderCallout({ tone: "danger", title: refusal })}</div>` : "";
  // The button stays on while the request is on its way: a disabled button that holds the focus loses it in Chrome.
  // The second press is the screen's to drop.
  const save = renderButton({ kind: "primary", label, disabled: !totals.ready || !named, data: { newTeamSave: true } });
  return `<div class="g-build__cta" data-key="build-cta">${alert}${save}<p class="g-build__note">${escapeHtml(note)}</p></div>`;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {object} props.race the race's page: its title, its table, its rules
 * @param {object} props.draft the build in progress (domain/roster/build.mjs)
 * @param {boolean} [props.rosterOpen] the phone's list of numbers and names is open
 * @param {"league"|"favoured"|null} [props.choice] the sheet that is open, if one is
 * @param {boolean} [props.pending] the request that saves the team is on its way
 * @param {string} [props.refusal] why the save was refused, as a sentence
 * @returns {string}
 */
export function builderMarkup({ race, draft, rosterOpen = false, choice = null, pending = false, refusal = "" }) {
  const totals = buildTotals(race, draft);
  const name = String(draft.teamName ?? "").trim();
  return `<div class="g-build">${headMarkup(race, name)}${budgetMarkup(totals)}${teamMarkup(race, draft)}${playersMarkup(race, draft, totals)}`
    + `${rosterMarkup(race, draft, rosterOpen)}${staffMarkup(race, draft)}${ctaMarkup({ totals, named: name !== "", pending, refusal })}`
    + `${choiceSheet(race, draft, choice)}</div>`;
}

const HANDLERS = ["onHire", "onStaff", "onToggleStaff", "onRefused", "onRosterToggle", "onNumber", "onName", "onCaptain", "onLogo", "onLogoRemove", "onChoiceOpen", "onChoose", "onChoiceClose", "onRestart", "onSave"];

/**
 * Listen to the screen. Delegated to `root`, which outlives the redraws.
 *
 * @param {Element} root
 * @param {object} handlers
 * @param {(rowIndex: number, delta: number) => void} handlers.onHire a position's «+» or «−»
 * @param {(key: string, delta: number) => void} handlers.onStaff a counted staff's «+» or «−»
 * @param {(key: string, on: boolean) => void} handlers.onToggleStaff a medic's switch
 * @param {(reason: string) => void} handlers.onRefused a «+» the rule refuses, with the rule's words
 * @param {() => void} handlers.onRosterToggle the phone's list opens or shuts
 * @param {(playerId: string, value: string) => void} handlers.onNumber
 * @param {(playerId: string, value: string) => void} handlers.onName
 * @param {(playerId: string) => void} handlers.onCaptain
 * @param {(file: File) => void} handlers.onLogo
 * @param {() => void} handlers.onLogoRemove
 * @param {(kind: string) => void} handlers.onChoiceOpen
 * @param {(kind: string, value: string) => void} handlers.onChoose
 * @param {() => void} handlers.onChoiceClose
 * @param {() => void} handlers.onRestart
 * @param {() => void} handlers.onSave
 * @returns {() => void} removes the listeners
 */
export function wireBuilder(root, handlers) {
  for (const name of HANDLERS) {
    if (typeof handlers[name] !== "function") throw new Error(`wireBuilder needs ${name}: a button of the screen would do nothing`);
  }
  const refused = ({ reason }) => handlers.onRefused(reason);
  const offs = [
    // The row index is a number: it is compared with the players' `rowIndex`, and a string never equals it.
    wireStepButtons(root, "hire", ({ key, delta }) => handlers.onHire(Number(key), delta), { onRefused: refused }),
    wireResourceCounters(root, ({ key, delta }) => handlers.onStaff(key, delta), { onRefused: refused }),
    wireToggles(root, (key, on) => handlers.onToggleStaff(key, on)),
    delegate(root, "click", "[data-roster-toggle]", () => handlers.onRosterToggle()),
    delegate(root, "input", "[data-player-number]", (event, input) => handlers.onNumber(input.getAttribute("data-player-number"), input.value)),
    delegate(root, "input", "[data-player-name]", (event, input) => handlers.onName(input.getAttribute("data-player-name"), input.value)),
    // The list holds the radios in the DOM; the radiogroup that owns them for a screen reader is the empty [data-captains].
    wireRadioGroups(root, { group: ".g-build__roster-list", item: "[data-captain]", attribute: "data-captain", onChange: (playerId) => handlers.onCaptain(playerId) }),
    delegate(root, "change", `#${LOGO_ID}`, (event, input) => {
      const file = input.files?.[0];
      // Emptied, so that the same file can be picked again after it was taken away.
      input.value = "";
      if (file) handlers.onLogo(file);
    }),
    delegate(root, "click", "[data-new-team-logo-remove]", () => handlers.onLogoRemove()),
    delegate(root, "click", "[data-new-team-choice]", (event, button) => handlers.onChoiceOpen(button.getAttribute("data-new-team-choice"))),
    wireOptionLists(root, (value, list) => {
      const kind = list.closest("[data-choice-kind]")?.getAttribute("data-choice-kind");
      if (kind) handlers.onChoose(kind, value);
    }),
    wireSheets(root, { onClose: (id) => { if (id === CHOICE_ID) handlers.onChoiceClose(); } }),
    delegate(root, "click", "[data-new-team-restart]", () => handlers.onRestart()),
    delegate(root, "click", "[data-new-team-save]", () => handlers.onSave()),
  ];
  return () => offs.forEach((off) => off());
}

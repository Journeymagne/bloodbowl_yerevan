/**
 * The steps of the preparation 3.0, each as cards (PreFans.html, PreWeather.html, PreRoster.html, PreReview.html; on a
 * desk the same cards in the frame's middle column, decision 17): the fans, the weather, the roster and the start. The
 * inducements are prep-inducements.mjs's; `prepStepMarkup` hands the frame whichever step is on screen.
 *
 * Dice are radio groups (the master plan's 05–13 rule): one `role="radiogroup"` with its name, a `role="radio"` per
 * face, the chosen one checked and the only one in the tab order (none chosen: the first). A press writes at once
 * (decision 19); the screen wires them (`data-prep-fans`, `data-prep-weather`, the season's `prep-season` segments).
 * The weather is one per match (the owner's M2 answer): both rows of D6 are pressable, by either coach. What cannot be
 * written — a match begun, a round closed, a roster confirmed — is drawn closed (`aria-disabled`).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { matchBudget } from "../../domain/match/budget.mjs";
import { matchCatalog } from "../../domain/match/catalog.mjs";
import { absenceOf } from "../../domain/roster/absence.mjs";
import { journeymanPositions } from "../../domain/match/roster.mjs";
import { MATCH_RULES, otherSide } from "../../domain/match/rules.mjs";

import { rosterMax } from "../../domain/roster/values.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { absenceWords } from "../team/roster/panel.mjs";
import { budgetCardMarkup, inducementsMarkup } from "./prep-inducements.mjs";
import { weatherTable } from "./prep-model.mjs";

/** The seasons of the weather table, as the domain names them. */
const SEASONS = ["Spring", "Summer", "Autumn"];

/** An upper-case label over a card's part (Ваш бросок D3, Время года, Таблица). */
const label = (text) => `<span class="g-prep__label">${escapeHtml(text)}</span>`;

/** A quiet paragraph of the step's words. */
const note = (text) => `<p class="g-prep__note">${escapeHtml(text)}</p>`;

/**
 * A die's faces as one radio group: `value` checked, the rest in order; closed with `aria-disabled` when it cannot be
 * written. `data` names what the screen writes (`data-prep-fans`, `data-prep-weather="home"`).
 */
function facesMarkup({ name, faces, value, closed, data }) {
  const entry = faces.includes(value) ? value : faces[0];
  const items = faces.map((face) => `<button type="button" class="g-prep__face" role="radio" aria-checked="${face === value}" tabindex="${face === entry ? 0 : -1}"`
    + `${closed ? ' aria-disabled="true"' : ""} data-prep-die="${face}">${face}</button>`).join("");
  return `<div class="g-prep__faces g-prep__faces--${faces.length}" role="radiogroup" aria-label="${escapeHtml(name)}" ${data}>${items}</div>`;
}

/** A team's head in a card: its name and a line under it, a chip at the right. */
const teamHead = (name, line, chipHtml) => `<div class="g-prep__teamrow"><span class="g-prep__teamtext"><b class="g-prep__team">${escapeHtml(name)}</b>`
  + `${line ? `<span class="g-prep__muted">${escapeHtml(line)}</span>` : ""}</span>${chipHtml}</div>`;

/** «Fan Factor» and its figure, in the accent's ink on our card. */
const resultRow = (text, figure, ours) => `<div class="g-prep__result"><span class="g-prep__resultk">${escapeHtml(text)}</span>`
  + `<span class="g-prep__big${ours ? " g-prep__big--ours" : ""}">${escapeHtml(figure)}</span></div>`;

/**
 * The fans (PreFans.html): Fan Factor = Dedicated Fans + D3; our card with the D3 to press, the opponent's with whether
 * he rolled.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model
 */
export function fansMarkup(model) {
  const { own, other } = model;
  const ours = `<div class="g-prep__panel">${teamHead(own.name, t("prep.fans.dedicated", { count: own.dedicatedFans }), renderStatusChip({ label: t("prep.fans.you"), tone: "live" }))}`
    + `${label(t("prep.fans.roll"))}${facesMarkup({ name: t("prep.fans.roll"), faces: [1, 2, 3], value: own.fansRoll, closed: model.readonly, data: "data-prep-fans" })}`
    + `${resultRow(t("prep.fans.factor"), own.fanFactor ? String(own.fanFactor) : "—", true)}</div>`;
  const chip = other.fansRoll ? renderStatusChip({ label: t("prep.fans.rolled"), tone: "live" }) : renderStatusChip({ label: t("prep.fans.waiting"), tone: "wait" });
  const theirs = `<div class="g-prep__panel">${teamHead(other.name, t("prep.fans.dedicated", { count: other.dedicatedFans }), chip)}`
    + `${resultRow(other.fansRoll ? t("prep.fans.theirs", { roll: other.fansRoll }) : t("prep.fans.factor"), other.fanFactor ? String(other.fanFactor) : "—", false)}</div>`;
  return `${note(t("prep.fans.intro"))}${ours}${theirs}${note(t("prep.fans.tabletop"))}`;
}

/** «4–10»: a roll of the weather table as the prototype writes it, with a dash between the ends. */
const rollWords = (roll) => String(roll).replace("-", "–");

/** The weather's result card: «Weather for the match · 4–10», its name and what it does. */
function weatherCard(result) {
  if (!result) return "";
  return `<div class="g-prep__weather"><span class="g-prep__muted">${escapeHtml(t("prep.weather.result", { range: rollWords(result.roll) }))}</span>`
    + `<b class="g-prep__weathername">${escapeHtml(result.name)}</b><span class="g-prep__weatherdesc">${escapeHtml(result.description)}</span></div>`;
}

/**
 * The weather (PreWeather.html): the time of year, a row of D6 for each team, their sum, the result and the table with
 * its row lit. One per match; either coach writes both dice.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model @param {object} data the reference
 */
export function weatherMarkup(model, data) {
  const { weather } = model.preparation;
  const season = SEASONS.includes(weather.season) ? weather.season : "Autumn";
  const segments = renderSegmentedControl({ label: t("prep.weather.season"), selected: season, data: { segGroup: "prep-season" },
    items: SEASONS.map((value) => ({ value, label: t(`pre.season.${value}`), disabled: model.readonly })) });
  const rows = ["home", "away"].map((side) => {
    const name = t("prep.weather.die", { team: model.sides[side] });
    return `${label(name)}${facesMarkup({ name, faces: [1, 2, 3, 4, 5, 6], value: weather[side], closed: model.readonly, data: `data-prep-weather="${side}"` })}`;
  }).join("");
  const sum = weather.home && weather.away ? String(Number(weather.home) + Number(weather.away)) : "—";
  const { entries, result } = weatherTable(data, { ...weather, season });
  const table = entries.map((entry) => {
    const lit = result && entry.roll === result.roll;
    return `<li class="g-prep__wrow${lit ? " g-prep__wrow--lit" : ""}"><span class="g-prep__wroll">${escapeHtml(rollWords(entry.roll))}</span><span>${escapeHtml(entry.name)}</span></li>`;
  }).join("");
  return `<div class="g-prep__panel">${label(t("prep.weather.season"))}${segments}${note(t("prep.weather.seasonNote"))}</div>`
    + `<div class="g-prep__panel">${rows}<div class="g-prep__sum">${escapeHtml(t("prep.weather.sum", { sum }))}</div></div>`
    + `${weatherCard(result)}<div class="g-prep__panel g-prep__panel--table">${label(t("prep.weather.table"))}<ul class="g-prep__wrows">${table}</ul></div>`;
}

/** A player's row: number, name, «Blitzer · C»; one who misses the match in the danger's colour with why. */
function playerRow(player, { out = false, remove = "" } = {}) {
  const position = `${player.row?.position ?? ""}${player.isCaptain ? ` · ${t("prep.roster.captain")}` : ""}`;
  const why = out ? t("prep.roster.misses", { reason: absenceWords({ retired: player.temporarilyRetired, absence: absenceOf(player) }) }) : position;
  const name = player.kind === "journeyman" ? t("prep.roster.journeyman") : player.name;
  return `<li class="g-prep__player${out ? " g-prep__player--out" : ""}"><span class="g-prep__num">${escapeHtml(player.number)}</span>`
    + `<span class="g-prep__pname">${escapeHtml(name)}</span><span class="g-prep__ppos">${escapeHtml(why)}</span>${remove}</li>`;
}

/** The order of a list: by number, the ones out first (PreRoster.html). */
const byNumber = (one, other) => (Number(one.number) || 0) - (Number(other.number) || 0);

/** A journeyman's button for a position: closed with why when seven are in the lineup, the position is full or the roster confirmed. */
function hireButton(row, side, { lineup, editable }) {
  const filled = [...side.players.filter((player) => !player.skipNextGame), ...side.journeymen].filter((player) => player.rowIndex === row.rowIndex).length;
  const reason = !editable ? t("prep.roster.lockedReason") : lineup >= MATCH_RULES.journeymanTarget ? t("prep.roster.full")
    : filled >= rosterMax(row.qty) ? t("prep.roster.positionFull", { position: row.position }) : "";
  const words = escapeHtml(t("prep.roster.hire", { position: row.position }));
  if (reason) return `<button type="button" class="g-prep__hire" aria-disabled="true">${words}<span class="g-prep__why">${escapeHtml(reason)}</span></button>`;
  return `<button type="button" class="g-prep__hire" data-prep-hire="${row.rowIndex}">${words}</button>`;
}

/**
 * The roster (PreRoster.html): who plays and who misses the match and why, the journeymen hired with «Remove», the card
 * to hire them by position, the note on confirming, and the opponent's lineup to open.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model
 */
export function rosterMarkup(model) {
  const side = model.preparation[model.sideName], rival = model.preparation[otherSide(model.sideName)];
  const editable = !model.readonly && !side.rosterLocked;
  const out = side.players.filter((player) => player.skipNextGame).sort(byNumber);
  const playing = side.players.filter((player) => !player.skipNextGame).sort(byNumber);
  const remove = (player) => (editable ? `<button type="button" class="g-prep__remove" data-prep-remove="${escapeHtml(player.id)}">${escapeHtml(t("prep.roster.remove"))}</button>` : "");
  const rows = [...out.map((player) => playerRow(player, { out: true })), ...playing.map((player) => playerRow(player)),
    ...side.journeymen.map((player) => playerRow(player, { remove: remove(player) }))].join("");
  const head = `<div class="g-prep__listhead"><b class="g-prep__lineup">${escapeHtml(t("prep.roster.lineup", { count: model.own.lineup, total: model.own.total }))}</b>`
    + `<span class="g-prep__muted">${escapeHtml(`${t("matches.ctv")} ${formatMoney(model.own.ctv)}`)}</span></div>`;
  const hires = journeymanPositions(side.reference).map((row) => hireButton(row, side, { lineup: model.own.lineup, editable })).join("");
  const theirs = [...rival.players.filter((player) => !player.skipNextGame).sort(byNumber), ...rival.journeymen].map((player) => playerRow(player)).join("");
  return `<div class="g-prep__panel g-prep__panel--list">${head}<ul class="g-prep__players">${rows}</ul></div>`
    + `<div class="g-prep__panel"><h3 class="g-prep__h3">${escapeHtml(t("prep.roster.journeymen"))}</h3>${note(t("prep.roster.journeymenNote", { count: model.own.lineup }))}`
    + `<div class="g-prep__hires">${hires}</div></div>${note(t("prep.roster.lockNote"))}`
    + `<details class="g-prep__more"><summary class="g-prep__summary">${escapeHtml(t("prep.roster.opponent"))}</summary><ul class="g-prep__players">${theirs}</ul></details>`;
}

/** «Perfect Conditions · autumn»: the weather and its time of year, for the start's card. */
export function weatherLine(model, data) {
  const { weather } = model.preparation;
  const { result } = weatherTable(data, weather);
  const season = t(`pre.season.${SEASONS.includes(weather.season) ? weather.season : "Autumn"}`).toLocaleLowerCase();
  return `<div class="g-prep__weather g-prep__weather--line"><span class="g-prep__muted">${escapeHtml(t("prep.review.weather"))}</span>`
    + `<b class="g-prep__weatherline">${escapeHtml(result ? `${result.name} · ${season}` : "—")}</b></div>`;
}

/** What a side buys: «Nuffle's Prayers · 15k, Bribe · 100k», or «—». */
function purchasesOf(side, data) {
  try {
    const bought = matchCatalog(side, data).filter((item) => side.basket[item.id]);
    return bought.length ? bought.map((item) => `${item.title}${side.basket[item.id] > 1 ? ` × ${side.basket[item.id]}` : ""} · ${formatMoney(item.cost * side.basket[item.id])}`).join(", ") : "—";
  } catch {
    return "—";
  }
}

/** The prayers and effects a side has recorded, in a line («Prayers: 7, 12 · Mark of Chaos»); "" for none. */
function effectsOf(side) {
  const effects = side.effects ?? {};
  const rolls = (Array.isArray(effects.prayers) ? effects.prayers : []).map((prayer) => prayer?.roll).filter(Boolean);
  const parts = [rolls.length ? t("prep.review.prayers", { rolls: rolls.join(", ") }) : "",
    side.basket?.["mark-of-chaos"] && effects.markTarget ? t("prep.review.mark") : "",
    side.basket?.["rowdy-rookies"] && effects.rookies?.first ? t("prep.review.rookies") : ""];
  return parts.filter(Boolean).join(" · ");
}

/** A side's card at the start: confirmed or waited for, then its rows. Ours says the treasury it spends. */
function reviewCard(model, which, data) {
  const facts = model[which];
  const side = model.preparation[facts.side];
  const chip = facts.confirmed ? renderStatusChip({ label: t("prep.review.confirmed"), tone: "live" }) : renderStatusChip({ label: t("prep.review.waiting"), tone: "wait" });
  const lineup = which === "other" ? String(facts.lineup)
    : facts.journeymen ? t("prep.review.lineupSome", { count: facts.lineup, journeymen: facts.journeymen }) : t("prep.review.lineupNone", { count: facts.lineup });
  const rows = [[t("prep.fans.factor"), facts.fanFactor ? String(facts.fanFactor) : "—"], [t("prep.review.lineup"), lineup],
    [t("matches.ctv"), formatMoney(facts.ctv)], [t("matches.inducements"), purchasesOf(side, data)]];
  if (which === "own") {
    let spent = "—";
    try {
      spent = t("prep.review.fromTreasury", { spent: formatMoney(matchBudget(model.preparation, facts.side, data).treasuryUsed), treasury: formatMoney(Number(side.roster.treasury)) });
    } catch { /* A treasury the rules cannot read says nothing. */ }
    rows.push([t("prep.review.treasury"), spent]);
  }
  const effects = effectsOf(side);
  if (effects) rows.push([t("prep.review.effects"), effects]);
  return `<div class="g-prep__panel g-prep__panel--rows">${teamHead(facts.name, "", chip)}`
    + `${rows.map(([key, value]) => `<div class="g-prep__row"><span class="g-prep__rowk">${escapeHtml(key)}</span><span class="g-prep__rowv">${escapeHtml(value)}</span></div>`).join("")}</div>`;
}

/**
 * The start (PreReview.html): the weather (a desk has it in its right column), both sides' cards and what the start
 * does. The footer confirms, then starts.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model @param {object} data
 * @param {{phone?: boolean}} [options]
 */
export function reviewMarkup(model, data, { phone = true } = {}) {
  return `${phone ? weatherLine(model, data) : ""}<div class="g-prep__sides">${reviewCard(model, "own", data)}${reviewCard(model, "other", data)}</div>${note(t("prep.review.note"))}`;
}

/**
 * The step on screen as the frame takes it: its middle (`contentHtml`), what a desk's right column holds of it
 * (`asideHtml`), a desk's card's title, and — on a desk's inducements, whose budget card holds the button — an empty
 * `footHtml`.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model @param {object} data @param {boolean} phone
 */
export function prepStepMarkup(model, data, phone) {
  if (model.step === "fans") return { contentHtml: fansMarkup(model), asideHtml: "", cardTitle: "" };
  if (model.step === "weather") return { contentHtml: weatherMarkup(model, data), asideHtml: "", cardTitle: "" };
  if (model.step === "roster") return { contentHtml: rosterMarkup(model), asideHtml: "", cardTitle: "" };
  if (model.step === "inducements") {
    return { contentHtml: inducementsMarkup(model, { desk: !phone }), asideHtml: phone ? "" : budgetCardMarkup(model, { desk: true }), cardTitle: "",
      ...(phone || !model.inducements ? {} : { footHtml: "" }) };
  }
  if (model.step === "review") {
    return { contentHtml: reviewMarkup(model, data, { phone }), asideHtml: phone ? "" : weatherLine(model, data), cardTitle: t("prep.review.title") };
  }
  return { contentHtml: "", asideHtml: "", cardTitle: "" };
}

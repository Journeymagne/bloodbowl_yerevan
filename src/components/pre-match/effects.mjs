import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { effectTargets, TARGET_PRAYERS } from "../../domain/match/effects.mjs";
import { prayerEntries } from "../../domain/match/weather.mjs";
import { journeymanPositions } from "../../domain/match/roster.mjs";
import { categoriesForAccess } from "../../domain/roster/values.mjs";
import { safe, diceField } from "./shared.mjs";

function targetOptions(players, selected) {
  return `<option value="">${t("pre.choosePlayer")}</option>${players.map(player => `<option value="${safe(player.id)}" ${selected === player.id ? "selected" : ""}>#${safe(player.number)} ${safe(player.name)}</option>`).join("")}`;
}

function prayerForm(prep, sideName, index, editable) {
  const prayer = prep[sideName].effects.prayers?.[index] || {}, entries = prayerEntries(state.data);
  const entry = entries.find(entry => entry.roll === Number(prayer.roll));
  const pool = effectTargets(prep, sideName, prayer.roll), multiple = Number(prayer.roll) === 6;
  const player = pool.find(player => player.id === prayer.targets?.[0]);
  const skills = state.data.skillGroups.filter(group => categoriesForAccess(player?.row.primary || []).includes(group.category)).flatMap(group => group.skills).filter(skill => !player?.skills.includes(skill));
  return `<div class="pre-effect-card"><h3>${t("pre.prayerNumber", { number: index + 1 })}</h3>
    <label>${t("pre.prayerResult")}<select name="prayer-${index}-roll" data-pre-prayer ${!editable ? "disabled" : ""}><option value="">${t("pre.chooseResult")}</option>${entries.map(entry => `<option value="${entry.roll}" ${Number(prayer.roll) === entry.roll ? "selected" : ""}>${entry.roll}. ${safe(entry.name)}</option>`).join("")}</select></label>
    ${entry ? `<p>${safe(entry.description)}</p>` : ""}
    ${TARGET_PRAYERS.has(Number(prayer.roll)) ? `<label>${t(multiple ? "pre.randomPlayers" : "pre.target")}<select name="prayer-${index}-targets" data-pre-prayer-target ${multiple ? "multiple" : ""} ${!editable ? "disabled" : ""}>${!multiple ? `<option value="">${t("pre.choosePlayer")}</option>` : ""}${pool.map(player => `<option value="${safe(player.id)}" ${prayer.targets?.includes(player.id) ? "selected" : ""}>#${safe(player.number)} ${safe(player.name)}</option>`).join("")}</select></label>` : ""}
    ${multiple ? diceField(`prayer-${index}-count`, prayer.count, 3, t("pre.targetCount")) : ""}
    ${Number(prayer.roll) === 16 ? `<label>${t("pre.primarySkill")}<select name="prayer-${index}-skill"><option value="">${t("pre.chooseResult")}</option>${skills.map(skill => `<option ${prayer.skill === skill ? "selected" : ""}>${safe(skill)}</option>`).join("")}</select></label>` : ""}</div>`;
}

export function renderEffects(prep, sideName, editable) {
  const side = prep[sideName], quantity = Number(side.basket["nuffles-prayers"] || 0);
  const mark = Boolean(side.basket["mark-of-chaos"]), rookies = Boolean(side.basket["rowdy-rookies"]);
  if (!quantity && !mark && !rookies) return "";
  return `<form class="pre-effects-form" data-pre-effects><h2>${t("pre.resolveEffects")}</h2><p class="muted-text">${t("pre.recordTabletop")}</p><fieldset ${!editable ? "disabled" : ""}>
    ${Array.from({ length: quantity }, (_, index) => prayerForm(prep, sideName, index, editable)).join("")}
    ${mark ? `<div class="pre-effect-card"><h3>${t("pre.markOfChaos")}</h3><label>${t("pre.target")}<select name="markTarget">${targetOptions(effectTargets(prep, sideName, 4), side.effects.markTarget)}</select></label><p>${safe(side.roster.favouredChoice)}</p></div>` : ""}
    ${rookies ? `<div class="pre-effect-card"><h3>${t("pre.rowdyRookies")}</h3><div class="pre-dice-row">${diceField("rookieFirst", side.effects.rookies?.first, 3, t("pre.firstDie"))}${diceField("rookieSecond", side.effects.rookies?.second, 3, t("pre.secondDie"))}</div><label>${t("roster.positionHeader")}<select name="rookiePosition">${journeymanPositions(side.reference).map(row => `<option value="${row.rowIndex}" ${Number(side.effects.rookies?.rowIndex) === row.rowIndex ? "selected" : ""}>${safe(row.position)}</option>`).join("")}</select></label><p>2D3 + 1</p></div>` : ""}
    ${editable ? `<button class="filter-button" type="submit">${t("pre.saveEffects")}</button>` : ""}</fieldset></form>`;
}

export function effectsFromForm(form, previous, quantity) {
  const values = new FormData(form);
  const prayers = Array.from({ length: quantity }, (_, index) => ({ roll: Number(values.get(`prayer-${index}-roll`)) || null,
    targets: values.getAll(`prayer-${index}-targets`).filter(Boolean), count: Number(values.get(`prayer-${index}-count`)) || null, skill: values.get(`prayer-${index}-skill`) || "" }));
  return { ...previous, prayers, markTarget: values.get("markTarget") || "",
    rookies: { first: Number(values.get("rookieFirst")) || null, second: Number(values.get("rookieSecond")) || null, rowIndex: Number(values.get("rookiePosition")) } };
}

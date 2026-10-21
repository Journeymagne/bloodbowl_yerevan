/**
 * The prayers and effects of the inducements bought (stage 09a decision 20): 2.x's form (components/pre-match/
 * effects.mjs) in 3.0's look — the prototypes have none. Nuffle's Prayers: the result rolled on the table, its target
 * (the opponent's players for 6 and 7, random ones — up to D3 — for 6), the primary skill for 16; Mark of Chaos: the
 * player marked; Rowdy Rookies: the two D3 and the position. The fields are native `<select>`s in a card.
 *
 * `effectsFromForm` reads the form back exactly as 2.x did — the same fields, the same names, the same object out —
 * so the domain's `validateEffects` reads it as before. It takes the form, or what `new FormData(form)` would give.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { effectTargets, TARGET_PRAYERS } from "../../domain/match/effects.mjs";
import { categoriesForAccess } from "../../domain/roster/values.mjs";
import { renderButton } from "../../ui/button.mjs";

/** An option, selected when it is the value. */
const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;

/** A labelled native select: its words over it, 13px. */
function selectField({ label, name, options, data = "", multiple = false, disabled = false }) {
  return `<label class="g-prep-effects__field"><span class="g-prep-effects__label">${escapeHtml(label)}</span>`
    + `<select class="g-prep-effects__select" name="${escapeHtml(name)}"${data}${multiple ? " multiple" : ""}${disabled ? " disabled" : ""}>${options}</select></label>`;
}

/** The players a target is chosen among: «#3 Ashby». */
const playerOptions = (players, selected, placeholder) => `${placeholder ? option("", t("prep.effect.choosePlayer"), !selected?.length) : ""}`
  + players.map((player) => option(player.id, `#${player.number} ${player.name}`, selected?.includes(player.id))).join("");

/** A D3 as a select: «—», 1, 2, 3. */
const d3Options = (value) => option("", "—", !value) + [1, 2, 3].map((face) => option(face, String(face), Number(value) === face)).join("");

/** One prayer: its result, then what it needs — a target, how many, a skill. */
function prayerCard(model, effects, index) {
  const prep = model.preparation, sideName = model.sideName;
  const prayer = effects.current.prayers?.[index] ?? {};
  const roll = Number(prayer.roll) || 0;
  const entry = effects.entries.find((each) => each.roll === roll);
  const closed = !effects.editable;
  const results = option("", t("prep.effect.choose"), !roll) + effects.entries.map((each) => option(each.roll, `${each.roll}. ${each.name}`, each.roll === roll)).join("");
  let fields = selectField({ label: t("prep.effect.result"), name: `prayer-${index}-roll`, options: results, data: " data-prep-prayer", disabled: closed });
  if (entry) fields += `<p class="g-prep-effects__desc">${escapeHtml(entry.description)}</p>`;
  if (TARGET_PRAYERS.has(roll)) {
    const many = roll === 6;
    const pool = effectTargets(prep, sideName, roll);
    fields += selectField({ label: t(many ? "prep.effect.random" : "prep.effect.target"), name: `prayer-${index}-targets`, multiple: many,
      options: playerOptions(pool, prayer.targets ?? [], !many), data: " data-prep-prayer-target", disabled: closed });
    if (many) fields += selectField({ label: t("prep.effect.count"), name: `prayer-${index}-count`, options: d3Options(prayer.count), disabled: closed });
    if (roll === 16) {
      const player = pool.find((each) => each.id === prayer.targets?.[0]);
      const allowed = categoriesForAccess(player?.row.primary ?? []);
      const skills = effects.skillGroups.filter((group) => allowed.includes(group.category)).flatMap((group) => group.skills).filter((skill) => !player?.skills.includes(skill));
      fields += selectField({ label: t("prep.effect.skill"), name: `prayer-${index}-skill`, disabled: closed,
        options: option("", t("prep.effect.choose"), !prayer.skill) + skills.map((skill) => option(skill, skill, prayer.skill === skill)).join("") });
    }
  }
  return `<div class="g-prep-effects__card"><h4 class="g-prep-effects__title">${escapeHtml(t("prep.effect.prayer", { number: index + 1 }))}</h4>${fields}</div>`;
}

/** Mark of Chaos: the player marked, and the god the team favours. */
function markCard(model, effects) {
  const pool = effectTargets(model.preparation, model.sideName, 4);
  const field = selectField({ label: t("prep.effect.target"), name: "markTarget", options: playerOptions(pool, [effects.current.markTarget].filter(Boolean), true), disabled: !effects.editable });
  const favoured = effects.favoured ? `<p class="g-prep-effects__desc">${escapeHtml(effects.favoured)}</p>` : "";
  return `<div class="g-prep-effects__card"><h4 class="g-prep-effects__title">${escapeHtml(t("prep.review.mark"))}</h4>${field}${favoured}</div>`;
}

/** Rowdy Rookies: the two D3, the position; 2D3 + 1 of them. */
function rookiesCard(effects) {
  const rookies = effects.current.rookies ?? {};
  const closed = !effects.editable;
  const positions = effects.positions.map((row) => option(row.rowIndex, row.position, Number(rookies.rowIndex) === row.rowIndex)).join("");
  return `<div class="g-prep-effects__card"><h4 class="g-prep-effects__title">${escapeHtml(t("prep.review.rookies"))}</h4><div class="g-prep-effects__pair">`
    + `${selectField({ label: t("prep.effect.first"), name: "rookieFirst", options: d3Options(rookies.first), disabled: closed })}`
    + `${selectField({ label: t("prep.effect.second"), name: "rookieSecond", options: d3Options(rookies.second), disabled: closed })}</div>`
    + `${selectField({ label: t("prep.effect.position"), name: "rookiePosition", options: positions, disabled: closed })}<p class="g-prep-effects__desc">${escapeHtml(t("prep.effect.rookiesNote"))}</p></div>`;
}

/**
 * The form of the prayers and effects bought; "" when none is. Written by «Save the effects» (`data-prep-effects`), a
 * prayer's result or target as soon as it is picked (`data-prep-prayer`, `data-prep-prayer-target`), as 2.x did.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model
 */
export function effectsMarkup(model) {
  const effects = model.inducements?.effects;
  if (!effects) return "";
  const cards = [...Array.from({ length: effects.prayers }, (_, index) => prayerCard(model, effects, index)),
    effects.mark ? markCard(model, effects) : "", effects.rookies ? rookiesCard(effects) : ""].join("");
  const save = effects.editable ? renderButton({ label: t("prep.saveEffects"), kind: "outline", type: "submit" }) : "";
  return `<form class="g-prep-effects" data-prep-effects><h3 class="g-prep__h3">${escapeHtml(t("prep.effects"))}</h3>`
    + `<p class="g-prep__note">${escapeHtml(t("prep.effectsNote"))}</p>${cards}${save}</form>`;
}

/**
 * The effects as the form says them, on top of what was recorded: each prayer's result, targets, count and skill, the
 * player marked, the rookies' dice and position — 2.x's object, field by field.
 * @param {HTMLFormElement|{get: (name: string) => unknown, getAll: (name: string) => unknown[]}} form
 * @param {object} previous the effects recorded
 * @param {number} quantity the prayers bought
 */
export function effectsFromForm(form, previous, quantity) {
  const values = typeof form?.getAll === "function" ? form : new FormData(form);
  const prayers = Array.from({ length: quantity }, (_, index) => ({ roll: Number(values.get(`prayer-${index}-roll`)) || null,
    targets: values.getAll(`prayer-${index}-targets`).filter(Boolean), count: Number(values.get(`prayer-${index}-count`)) || null, skill: values.get(`prayer-${index}-skill`) || "" }));
  return { ...previous, prayers, markTarget: values.get("markTarget") || "",
    rookies: { first: Number(values.get("rookieFirst")) || null, second: Number(values.get("rookieSecond")) || null, rowIndex: Number(values.get("rookiePosition")) } };
}

/** A grant and its SPP payment are selected and applied as one advancement. */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { advancementRanks } from "../../domain/league-rules.mjs";
import { rowsForTeam } from "../../domain/roster/values.mjs";
import { normalizePlayerAdvancements } from "../../domain/roster/players.mjs";
import {
  advancementGrantOptions, applyAdvancement, canTakeAdvancement, removeAdvancement,
  playerAdvancementLevel, playerAdvancementSpent, playerAvailableSpp, playerLevelRank, playerSppTotal,
} from "../../domain/roster/progression.mjs";
import { REMOVE_ICON } from "../icons.mjs";
import { toast } from "../toast.mjs";

const choicesByDraft = new WeakMap();

function choicesFor(draft) {
  if (!choicesByDraft.has(draft)) choicesByDraft.set(draft, new Map());
  return choicesByDraft.get(draft);
}

/** The first choice contains only unowned skills accessible to this position. */
export function playerAdvancementChoices(row, player, skillGroups) {
  const choices = new Map();
  for (const type of ["primary", "secondary"]) {
    for (const option of advancementGrantOptions(row, player, type, skillGroups).options) {
      const value = `skill:${option.skill}`;
      const choice = choices.get(value) ?? { value, label: option.skill, grant: { skill: option.skill }, types: [] };
      choice.types.push(...(type === "primary" ? ["random", "primary"] : ["secondary"]));
      choices.set(value, choice);
    }
  }
  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label, "en"));
}

function grantChoices(row, player, skillGroups) {
  return [...playerAdvancementChoices(row, player, skillGroups),
    ...advancementGrantOptions(row, player, "stat").options.map(({ stat }) => ({
      value: `stat:${stat}`, label: `${t("stats." + stat)} +1`, grant: { stat }, types: ["stat"],
    }))];
}

function typeLabel(type) {
  return t(type === "stat" ? "roster.characteristicAdvancement" : "post.advancement." + type);
}

export function renderPlayerLevel(team, player) {
  return `<div class="player-level-stack">
    <strong><span class="player-level-number">${playerAdvancementLevel(player)}</span> (${escapeHtml(playerLevelRank(player))})</strong>
    <section class="player-progression-balance" aria-label="SPP">
      <h4>SPP</h4>
      <dl class="player-spp-ledger">
        <div class="player-spp-available"><dt>${t("roster.sppBalanceAvailable")}</dt><dd data-player-available-spp>${playerAvailableSpp(team, player)}</dd></div>
        <div><dt>${t("roster.sppBalanceEarned")}</dt><dd data-player-spp-total>${playerSppTotal(team, player)}</dd></div>
        <div><dt>${t("roster.sppBalanceSpent")}</dt><dd data-player-spent-spp>${playerAdvancementSpent(player)}</dd></div>
      </dl>
    </section>
  </div>`;
}

function renderHistory(player) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  return `<div class="advancement-history"><h4>${t("roster.advancementHistory")}</h4><div class="advancement-list">
    ${advancements.length ? advancements.map((advancement, index) => {
      const grant = advancement.grants;
      const name = grant?.skill ?? (grant?.stat ? `${t("stats." + grant.stat)} +1` : "");
      const cost = advancementRanks[index]?.costs?.[advancement.type] ?? 0;
      return `<button class="roster-pill advancement-pill" type="button" data-saved-player-remove-advancement="${index}" title="${escapeHtml(t("roster.undoAdvancement"))}">
        ${escapeHtml([name, typeLabel(advancement.type), `${cost}`].filter(Boolean).join(" · "))}${REMOVE_ICON}
      </button>`;
    }).join("") : `<p class="muted-text">${t("roster.noAdvancementsYet")}</p>`}
  </div></div>`;
}

function renderAdvancementForm(team, player, options, selection) {
  const choice = options.find(option => option.value === selection.grant);
  const type = choice?.types.includes(selection.type) ? selection.type : "";
  const verdict = type ? canTakeAdvancement(team, player, type) : null;
  const skills = options.filter(option => option.grant.skill), stats = options.filter(option => option.grant.stat);
  const optionMarkup = option => `<option value="${escapeHtml(option.value)}" ${option.value === choice?.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
  const hint = !choice ? t("roster.chooseAdvancementGrant") : !type ? t("roster.chooseAcquisitionType")
    : verdict.allowed ? t("roster.advancementPayment", { cost: verdict.cost, remaining: verdict.available - verdict.cost })
      : t(`validation.${verdict.reason}`, verdict.params);
  return `<div class="player-advancement-form">
    <label class="advancement-field"><span>${t("roster.advancementGrant")}</span>
      <select class="table-select" data-saved-player-advancement-grant>
        <option value="" ${!choice ? "selected" : ""}>${t("roster.chooseAdvancementGrant")}</option>
        <optgroup label="${escapeHtml(t("roster.skillsLabel"))}">${skills.map(optionMarkup).join("")}</optgroup>
        <optgroup label="${escapeHtml(t("roster.statsHeading"))}">${stats.map(optionMarkup).join("")}</optgroup>
      </select>
    </label>
    <label class="advancement-field"><span>${t("roster.acquisitionType")}</span>
      <select class="table-select" data-saved-player-advancement-type ${!choice ? "disabled" : ""}>
        <option value="" ${!type ? "selected" : ""}>${t("roster.chooseAcquisitionType")}</option>
        ${(choice?.types ?? []).map(value => `<option value="${value}" ${value === type ? "selected" : ""}>${escapeHtml(typeLabel(value))} · ${canTakeAdvancement(team, player, value).cost} SPP</option>`).join("")}
      </select>
    </label>
    <p class="advancement-payment ${verdict && !verdict.allowed ? "danger-text" : ""}" role="status">${escapeHtml(hint)}</p>
    ${type === "random" ? `<p class="advancement-hint">${t("roster.randomSkillHint")}</p>` : ""}
    <button class="primary-button" type="button" data-saved-player-add-advancement ${!verdict?.allowed ? "disabled" : ""}>${t("common.confirm")}${verdict ? ` · ${verdict.cost} SPP` : ""}</button>
  </div>`;
}

export function renderPlayerAdvancements(team, draft, player, skillGroups) {
  const options = grantChoices(player.row, player, skillGroups);
  const selection = choicesFor(draft).get(player.id) ?? {};
  const nextRank = advancementRanks[playerAdvancementLevel(player)];
  return `<div class="advancement-control">
    ${nextRank ? renderAdvancementForm(team, player, options, selection) : `<strong>${t("roster.maxLevel")}</strong>`}
    ${nextRank ? `<p class="advancement-next">${t("roster.next")}: ${escapeHtml(nextRank.rank)}</p>` : ""}
    ${renderHistory(player)}
  </div>`;
}

export function wirePlayerAdvancements(onPlayer, { team, draft, skillGroups, rerender }) {
  onPlayer("change", "[data-saved-player-advancement-grant]", ({ target, player }) => {
    choicesFor(draft).set(player.id, { grant: target.value, type: "" });
    rerender({ save: false });
  });
  onPlayer("change", "[data-saved-player-advancement-type]", ({ target, player }) => {
    const selection = choicesFor(draft).get(player.id) ?? {};
    choicesFor(draft).set(player.id, { ...selection, type: target.value });
    rerender({ save: false });
  });
  onPlayer("click", "[data-saved-player-add-advancement]", ({ card, player }) => {
    const row = rowsForTeam(team)[player.rowIndex];
    const value = card.querySelector("[data-saved-player-advancement-grant]")?.value;
    const type = card.querySelector("[data-saved-player-advancement-type]")?.value;
    const choice = grantChoices(row, player, skillGroups).find(option => option.value === value);
    if (!choice || !choice.types.includes(type)) return;
    const result = applyAdvancement(team, row, player, type, choice.grant, skillGroups);
    if (!result.applied) { toast(t(`validation.${result.reason}`, result.params), { tone: "error" }); return; }
    choicesFor(draft).delete(player.id);
    rerender();
  });
  onPlayer("click", "[data-saved-player-remove-advancement]", ({ target, player }) => {
    if (removeAdvancement(player, Number(target.dataset.savedPlayerRemoveAdvancement)).removed) rerender();
  });
  onPlayer("click", "[data-saved-player-remove-skill]", ({ target, player }) => {
    const skill = target.dataset.savedPlayerRemoveSkill;
    const index = normalizePlayerAdvancements(player.advancements).findIndex(advance => advance.grants?.skill === skill);
    if (index >= 0) removeAdvancement(player, index);
    else player.extraSkills = (player.extraSkills ?? []).filter(entry => entry.name !== skill);
    rerender();
  });
}

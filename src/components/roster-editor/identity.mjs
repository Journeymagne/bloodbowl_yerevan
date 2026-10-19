/**
 * Who the team is: its race, its name, its logo, and the rules that follow from
 * the race.
 *
 * There used to be two copies — the identity block inside the builder's info
 * panel and renderSavedRosterIdentity — the same three fields, the same logo
 * preview and the same rule-access panel, differing only in the data attributes
 * the controls carried and two class names. The builder is gone (the 3.0 team
 * builder replaced it); the editor keeps its own wrapper element, because that
 * is layout, and the stylesheet targets it by name.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { renderTeamRuleAccess } from "../roster-editor-shared.mjs";
import { iconButton } from "../icons.mjs";

/**
 * @param {object} options
 * @param {object} options.team the race currently chosen
 * @param {object} options.draft the roster being edited
 * @param {object[]} options.teams every race, for the picker
 * @param {object} options.mode LEAGUE_MODE
 */
export function renderIdentityFields({ team, draft, teams, mode }) {
  const attribute = mode.identityAttribute;
  return `
    <div class="builder-form ${mode.identityFormClass}">
      <label class="filter-field">
        <span>${t("sidebar.teamHeading")}</span>
        <select data-${attribute}-team>
          ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
        </select>
      </label>
      <label class="filter-field">
        <span>${t("savedRoster.teamName")}</span>
        <input type="text" value="${escapeHtml(draft.teamName || team.title)}" data-${attribute}-name>
      </label>
      <label class="filter-field">
        <span>${t("savedRoster.logoField")}</span>
        <input type="file" accept="image/*" data-${attribute}-logo>
      </label>
    </div>
    ${draft.logoData ? `
      <div class="builder-logo-inline roster-logo-inline">
        <img class="builder-logo-preview" src="${escapeHtml(draft.logoData)}" alt="">
        ${iconButton("trash", { title: t("savedRoster.removeLogo"), attributes: `data-${attribute}-remove-logo` })}
      </div>
    ` : ""}
    ${renderTeamRuleAccess(team, draft, attribute)}
  `;
}

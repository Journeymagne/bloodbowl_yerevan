/**
 * Who the team is: its race, its name, its logo, and the rules that follow from
 * the race. Shared by both editors.
 *
 * There used to be two copies — the identity block inside the builder's info
 * panel and renderSavedRosterIdentity — the same three fields, the same logo
 * preview and the same rule-access panel, differing only in the data attributes
 * the controls carried and two class names.
 *
 * Only the contents are shared. Each editor keeps its own wrapper element,
 * because that is layout: the builder's block sits inside its info panel, the
 * league editor's is a side panel of its own, and the stylesheet targets both
 * by name.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { renderTeamRuleAccess } from "../roster-editor-shared.mjs";

/**
 * @param {object} options
 * @param {object} options.team the race currently chosen
 * @param {object} options.draft the roster being edited
 * @param {object[]} options.teams every race, for the picker
 * @param {object} options.mode CREATE_MODE or LEAGUE_MODE
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
        <button class="filter-button compact-action" type="button" data-${attribute}-remove-logo>${t("savedRoster.removeLogo")}</button>
      </div>
    ` : ""}
    ${renderTeamRuleAccess(team, draft, attribute)}
  `;
}
